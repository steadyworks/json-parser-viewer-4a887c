'use client'
import { useState, useCallback, useRef } from 'react'

const BACKEND = 'http://localhost:3001'

// ─── Path helpers ──────────────────────────────────────────────────────────

function childPath(parentPath, key) {
  if (typeof key === 'number') return `${parentPath}[${key}]`
  // dot notation for valid identifiers, bracket otherwise
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return `${parentPath}.${key}`
  return `${parentPath}["${key}"]`
}

// ─── Collect all container paths for expand/collapse all ──────────────────

function collectContainerPaths(node, path, acc = []) {
  if (node.type === 'object' || node.type === 'array') {
    acc.push(path)
    if (node.type === 'object') {
      node.children.forEach(c => collectContainerPaths(c.node, childPath(path, c.key), acc))
    } else {
      node.children.forEach((c, i) => collectContainerPaths(c.node, `${path}[${i}]`, acc))
    }
  }
  return acc
}

// ─── Tree-to-string (preserve number precision) ───────────────────────────

function treeToString(node, indent, level = 0) {
  const pad = ' '.repeat(indent * (level + 1))
  const closePad = ' '.repeat(indent * level)
  switch (node.type) {
    case 'null': return 'null'
    case 'boolean': return String(node.value)
    case 'number': return node.raw
    case 'string': return JSON.stringify(node.value)
    case 'object': {
      if (!node.children.length) return '{}'
      const entries = node.children.map(c =>
        `${pad}${JSON.stringify(c.key)}: ${treeToString(c.node, indent, level + 1)}`
      )
      return `{\n${entries.join(',\n')}\n${closePad}}`
    }
    case 'array': {
      if (!node.children.length) return '[]'
      const items = node.children.map(c =>
        `${pad}${treeToString(c.node, indent, level + 1)}`
      )
      return `[\n${items.join(',\n')}\n${closePad}]`
    }
    default: return ''
  }
}

function treeToMinified(node) {
  switch (node.type) {
    case 'null': return 'null'
    case 'boolean': return String(node.value)
    case 'number': return node.raw
    case 'string': return JSON.stringify(node.value)
    case 'object': {
      const entries = node.children.map(c => `${JSON.stringify(c.key)}:${treeToMinified(c.node)}`)
      return `{${entries.join(',')}}`
    }
    case 'array': {
      const items = node.children.map(c => treeToMinified(c.node))
      return `[${items.join(',')}]`
    }
    default: return ''
  }
}

// ─── TreeNode component ───────────────────────────────────────────────────

function TreeNode({ node, path, parentKey, collapsed, onToggle, onHover, onLeave }) {
  const isContainer = node.type === 'object' || node.type === 'array'
  const isCollapsed = collapsed.has(path)

  const displayValue = () => {
    switch (node.type) {
      case 'null': return <span className="val-null">null</span>
      case 'boolean': return <span className="val-boolean">{String(node.value)}</span>
      case 'number': return <span className="val-number">{node.raw}</span>
      case 'string': return <span className="val-string">&quot;{node.value}&quot;</span>
      default: return null
    }
  }

  const containerLabel = node.type === 'object'
    ? (isCollapsed ? '{…}' : '{')
    : (isCollapsed ? '[…]' : '[')
  const closingBracket = node.type === 'object' ? '}' : ']'

  return (
    <div className="tree-node" data-testid="tree-node" data-path={path}>
      <div className="node-row">
        {isContainer
          ? (
            <button
              className="node-toggle"
              data-testid="node-toggle"
              data-path={path}
              onClick={() => onToggle(path)}
              onMouseEnter={e => onHover(path, e)}
              onMouseLeave={onLeave}
            >
              {isCollapsed ? '▶' : '▼'}
            </button>
          )
          : <span style={{ width: 14, display: 'inline-block' }} />
        }

        {parentKey !== undefined && (
          <span
            className="node-key"
            data-testid="node-key"
            data-path={path}
            onMouseEnter={e => onHover(path, e)}
            onMouseLeave={onLeave}
          >
            &quot;{parentKey}&quot;:&nbsp;
          </span>
        )}

        {isContainer ? (
          <span
            className="val-container"
            onMouseEnter={e => onHover(path, e)}
            onMouseLeave={onLeave}
          >
            {containerLabel}
          </span>
        ) : (
          <span
            data-testid="node-value"
            data-path={path}
            onMouseEnter={e => onHover(path, e)}
            onMouseLeave={onLeave}
          >
            {displayValue()}
          </span>
        )}
      </div>

      {isContainer && !isCollapsed && (
        <>
          <div className="node-children">
            {node.type === 'object'
              ? node.children.map((child, i) => (
                <TreeNode
                  key={i}
                  node={child.node}
                  path={childPath(path, child.key)}
                  parentKey={child.key}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onHover={onHover}
                  onLeave={onLeave}
                />
              ))
              : node.children.map((child, i) => (
                <TreeNode
                  key={i}
                  node={child.node}
                  path={`${path}[${i}]`}
                  collapsed={collapsed}
                  onToggle={onToggle}
                  onHover={onHover}
                  onLeave={onLeave}
                />
              ))
            }
          </div>
          <div className="node-row">
            <span style={{ width: 14, display: 'inline-block' }} />
            <span className="val-container">{closingBracket}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function Home() {
  const [inputText, setInputText] = useState('')
  const [parseResult, setParseResult] = useState(null) // null | {ok,tree} | {ok,error,line,col}
  const [collapsed, setCollapsed] = useState(new Set())
  const [tooltip, setTooltip] = useState(null) // {path, x, y}
  const tooltipRef = useRef(null)

  const isValid = parseResult && parseResult.ok

  async function handleParse() {
    try {
      const res = await fetch(`${BACKEND}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      })
      const data = await res.json()
      setParseResult(data)
      if (data.ok) {
        setCollapsed(new Set()) // all expanded on fresh parse
      }
    } catch {
      setParseResult({ ok: false, error: 'Network error: could not reach backend', line: 1, column: 1 })
    }
  }

  function handlePrettify() {
    if (!isValid) return
    setInputText(treeToString(parseResult.tree, 2))
  }

  function handleMinify() {
    if (!isValid) return
    setInputText(treeToMinified(parseResult.tree))
  }

  function handleCollapseAll() {
    if (!parseResult?.ok) return
    const paths = collectContainerPaths(parseResult.tree, '$')
    setCollapsed(new Set(paths))
  }

  function handleExpandAll() {
    setCollapsed(new Set())
  }

  const handleToggle = useCallback((path) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleHover = useCallback((path, e) => {
    setTooltip({ path, x: e.clientX, y: e.clientY })
  }, [])

  const handleLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div className="header">JSON Parser &amp; Viewer</div>

      {/* Panels */}
      <div className="panels">
        {/* Left: Input */}
        <div className="panel">
          <div className="panel-header">Input</div>
          <div className="input-area">
            <textarea
              className="json-textarea"
              data-testid="json-input"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Paste or type JSON here…"
              spellCheck={false}
            />
            <div className="btn-row">
              <button
                className="btn-parse"
                data-testid="parse-btn"
                onClick={handleParse}
              >
                Parse
              </button>
              <button
                data-testid="prettify-btn"
                disabled={!isValid}
                onClick={handlePrettify}
              >
                Prettify
              </button>
              <button
                data-testid="minify-btn"
                disabled={!isValid}
                onClick={handleMinify}
              >
                Minify
              </button>
            </div>
          </div>
        </div>

        {/* Right: Output */}
        <div className="panel">
          <div className="panel-header">Output</div>
          <div className="output-area">
            {isValid && (
              <>
                <div className="tree-controls">
                  <button data-testid="expand-all-btn" onClick={handleExpandAll}>
                    Expand All
                  </button>
                  <button data-testid="collapse-all-btn" onClick={handleCollapseAll}>
                    Collapse All
                  </button>
                </div>
                <div className="tree-scroll">
                  <div data-testid="tree-view">
                    <TreeNode
                      node={parseResult.tree}
                      path="$"
                      collapsed={collapsed}
                      onToggle={handleToggle}
                      onHover={handleHover}
                      onLeave={handleLeave}
                    />
                  </div>
                </div>
              </>
            )}

            {parseResult && !parseResult.ok && (
              <div className="error-banner" data-testid="error-banner">
                <strong>Parse Error</strong>
                <div className="error-message" data-testid="error-message">
                  {parseResult.error}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="tooltip"
          data-testid="value-tooltip"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          <span data-testid="tooltip-path">{tooltip.path}</span>
        </div>
      )}
    </div>
  )
}
