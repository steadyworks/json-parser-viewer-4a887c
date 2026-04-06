'use strict'
const http = require('http')

// ─── Custom RFC 8259 JSON Parser ───────────────────────────────────────────

class ParseError extends Error {
  constructor(msg, line, col) {
    super(`${msg} (line ${line}, column ${col})`)
    this.line = line
    this.col = col
  }
}

class Parser {
  constructor(text) {
    this.text = text
    this.pos = 0
    this.line = 1
    this.col = 1
  }

  err(msg) { throw new ParseError(msg, this.line, this.col) }

  ch() { return this.text[this.pos] }

  advance() {
    const c = this.text[this.pos]
    if (c === '\n') { this.line++; this.col = 1 }
    else { this.col++ }
    this.pos++
    return c
  }

  skipWS() {
    while (this.pos < this.text.length) {
      const c = this.text[this.pos]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this.advance()
      } else if (c === '/' && this.text[this.pos + 1] === '/') {
        this.err('Line comments are not valid JSON')
      } else if (c === '/' && this.text[this.pos + 1] === '*') {
        this.err('Block comments are not valid JSON')
      } else {
        break
      }
    }
  }

  parse() {
    if (typeof this.text !== 'string' || this.text.trim().length === 0) {
      throw new ParseError('Empty or whitespace-only input', 1, 1)
    }
    this.skipWS()
    if (this.pos >= this.text.length) {
      throw new ParseError('Empty input', 1, 1)
    }
    const tree = this.parseValue()
    this.skipWS()
    if (this.pos < this.text.length) {
      this.err(`Unexpected character '${this.ch()}' after JSON value`)
    }
    return tree
  }

  parseValue() {
    this.skipWS()
    const c = this.ch()
    if (c === undefined) this.err('Unexpected end of input')
    if (c === "'") this.err('Single-quoted strings are not valid JSON')
    if (c === 't' || c === 'f' || c === 'n') return this.parseKeyword()
    if (c === 'N' || c === 'I' || c === 'u') return this.parseKeyword()
    if (c === '-' || (c >= '0' && c <= '9')) return this.parseNumber()
    this.err(`Unexpected character '${c}'`)
  }

  parseString() {
    const sLine = this.line, sCol = this.col
    this.advance() // consume "
    let val = ''
    while (true) {
      if (this.pos >= this.text.length) {
        throw new ParseError('Unterminated string', sLine, sCol)
      }
      const c = this.text[this.pos]
      if (c === '"') { this.advance(); break }
      if (c === '\\') {
        this.advance()
        const esc = this.text[this.pos]
        this.advance()
        switch (esc) {
          case '"': val += '"'; break
          case '\\': val += '\\'; break
          case '/': val += '/'; break
          case 'f': val += '\f'; break
          case 't': val += '\t'; break
          case 'u': {
            const hex = this.text.slice(this.pos, this.pos + 4)
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.err('Invalid \\u escape sequence')
            const cp = parseInt(hex, 16)
            for (let i = 0; i < 4; i++) this.advance();
            break
          }
          default: this.err(`Invalid escape sequence '\\${esc}'`)
        }
      } else {
        // raw char — control chars (except allowed) not permitted
        const code = c.charCodeAt(0)
        if (code < 0x20) this.err(`Invalid control character 0x${code.toString(16)} in string`)
        val += c
        this.advance()
      }
    }
    return { type: 'string', value: val }
  }

  parseObject() {
    this.advance() // consume {
    this.skipWS()
    const children = []
    const seenKeys = new Set()
    if (this.ch() === '}') { this.advance(); return { type: 'object', children } }
    while (true) {
      this.skipWS()
      if (this.ch() === "'") this.err('Object keys must be double-quoted strings')
      if (this.ch() !== '"') this.err(`Object key must be a string, got '${this.ch()}'`)
      const keyNode = this.parseString()
      if (seenKeys.has(keyNode.value)) this.err(`Duplicate key '${keyNode.value}'`)
      seenKeys.add(keyNode.value)
      this.skipWS()
      if (this.ch() !== ':') this.err(`Expected ':' after object key, got '${this.ch()}'`)
      this.advance()
      this.skipWS()
      const valNode = this.parseValue()
      children.push({ key: keyNode.value, node: valNode })
      this.skipWS()
      if (this.ch() === ',') {
        this.advance()
        this.skipWS()
        if (this.ch() === '}') this.err('Trailing commas are not valid JSON')
      } else if (this.ch() === '}') {
        this.advance(); break
      } else {
        this.err(`Expected ',' or '}', got '${this.ch()}'`)
      }
    }
    return { type: 'object', children }
  }

  parseArray() {
    this.advance() // consume [
    this.skipWS()
    const children = []
    if (this.ch() === ']') { this.advance(); return { type: 'array', children } }
    while (true) {
      this.skipWS()
      const valNode = this.parseValue()
      children.push({ node: valNode })
      this.skipWS()
      if (this.ch() === ',') {
        this.advance()
        this.skipWS()
        if (this.ch() === ']') this.err('Trailing commas are not valid JSON')
      } else if (this.ch() === ']') {
        this.advance(); break
      } else {
        this.err(`Expected ',' or ']', got '${this.ch()}'`)
      }
    }
    return { type: 'array', children }
  }

  parseNumber() {
    const start = this.pos
    if (this.ch() === '-') this.advance()
    if (this.ch() === '0') {
      this.advance()
      if (this.ch() === 'x' || this.ch() === 'X') this.err('Hexadecimal numbers are not valid JSON')
      if (this.ch() >= '0' && this.ch() <= '9') this.err('Numbers with leading zeros are not valid JSON')
    } else if (this.ch() >= '1' && this.ch() <= '9') {
      while (this.ch() >= '0' && this.ch() <= '9') this.advance()
    } else {
      this.err(`Invalid number character '${this.ch()}'`)
    }
    if (this.ch() === '.') {
      this.advance()
      if (!(this.ch() >= '0' && this.ch() <= '9')) this.err('Expected digit after decimal point')
      while (this.ch() >= '0' && this.ch() <= '9') this.advance()
    }
    if (this.ch() === 'e' || this.ch() === 'E') {
      this.advance()
      if (this.ch() === '+' || this.ch() === '-') this.advance()
      if (!(this.ch() >= '0' && this.ch() <= '9')) this.err('Expected digit in exponent')
      while (this.ch() >= '0' && this.ch() <= '9') this.advance()
    }
    const raw = this.text.slice(start, this.pos)
    return { type: 'number', raw }
  }

  parseKeyword() {
    const sLine = this.line, sCol = this.col
    const start = this.pos
    while (this.pos < this.text.length && /[a-zA-Z_]/.test(this.text[this.pos])) this.advance()
    const word = this.text.slice(start, this.pos)
    if (this.ch() === 'e' || this.ch() === 'E') {
      this.advance()
      if (this.ch() === '+' || this.ch() === '-') this.advance()
      if (!(this.ch() >= '0' && this.ch() <= '9')) this.err('Expected digit in exponent')
      while (this.ch() >= '0' && this.ch() <= '9') this.advance()
    }
    switch (word) {
      case 'true': return { type: 'boolean', value: true }
      case 'false': return { type: 'boolean', value: false }
      case 'null': return { type: 'null', value: null }
      case 'NaN': throw new ParseError("'NaN' is not valid JSON", sLine, sCol)
      case 'Infinity': throw new ParseError("'Infinity' is not valid JSON", sLine, sCol)
      case 'undefined': throw new ParseError("'undefined' is not valid JSON", sLine, sCol)
      default: throw new ParseError(`Unexpected identifier '${word}'`, sLine, sCol)
    }
  }
}

function parseJSON(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'Empty or whitespace-only input', line: 1, column: 1 }
  }
  try {
    const tree = new Parser(text).parse()
    return { ok: true, tree }
  } catch (e) {
    return { ok: false, error: e.message, line: e.line || 1, column: e.col || 1 }
  }
}

// ─── HTTP Server ────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:3000',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const server = http.createServer((req, res) => {
  // Add CORS to every response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/parse') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body)
        const result = parseJSON(text)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Bad request', line: 1, column: 1 }))
      }
    })
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('JSON Parser Backend')
})

server.listen(3001, '0.0.0.0', () => {
  console.log('Backend listening on http://0.0.0.0:3001')
})
