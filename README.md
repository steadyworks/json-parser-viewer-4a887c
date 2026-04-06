# JSON Parser & Viewer

Build a browser-based tool that lets anyone paste raw JSON text, instantly validate it, and explore the structure through a collapsible, syntax-highlighted tree. No accounts, no persistence — every visit starts fresh.

## Stack

- **Frontend**: Pure React on port **3000**
- **Backend**: Node.js on port **3001**
- **Persistence**: None — the app is fully stateless

## Layout

The UI is a **single page at `/`**. It is split into two equal panels side by side:

- **Left panel** — the input area where the user types or pastes JSON
- **Right panel** — the output area that shows either the parsed tree or an error banner

A header bar spans the full width and contains the app title.

## Input Panel

A large, resizable `<textarea>` occupies most of the left panel. Below or above it (your choice), three buttons are always visible:

- **Parse** — submits the current text for parsing. Always enabled.
- **Format / Prettify** — rewrites the textarea content using 2-space indentation and standard newlines. Only enabled when the current textarea content is valid JSON.
- **Minify** — rewrites the textarea content as a single-line compact string with no unnecessary whitespace. Only enabled when the current textarea content is valid JSON.

The Prettify and Minify buttons should apply their transformation immediately, in-place in the textarea. They do not trigger a re-parse or clear the tree view.

## Output Panel

The right panel has two mutually exclusive states:

**When JSON is valid:** the tree view is rendered along with two global control buttons:
- **Expand All** — recursively opens every collapsed node in the tree
- **Collapse All** — recursively hides every child under every collapsible node

**When JSON is invalid:** a visually prominent red error banner replaces the tree. The banner contains a human-readable message that names the problem and includes the approximate **line number** and **column number** of the first error encountered.

The output panel should be empty (no banner, no tree) on initial page load before the user clicks Parse for the first time.

## Tree View

Each JSON value is rendered as a row in the tree. The visual style must communicate type at a glance:

| Value type | Color |
|---|---|
| String | Green |
| Number | Blue |
| Boolean (`true` / `false`) | Orange |
| `null` | Gray |
| Object / array key | Dark purple |

Object and array nodes are **collapsible**. Each one has a toggle control (e.g. an arrow or triangle) that hides or reveals its children. The toggle icon should clearly reflect the current state (expanded vs. collapsed). On initial render, all nodes are expanded by default.

Leaf values (strings, numbers, booleans, null) are not toggleable.

The tree must render all valid JSON structures, including:
- Top-level bare values (`null`, `true`, `false`, a bare number, a bare string)
- Empty objects `{}` and empty arrays `[]`
- Deeply nested hierarchies

## Hover Tooltips

When the user hovers over **any value** in the tree — including keys, leaf values, and the labels of object/array nodes — a tooltip appears showing the full **JSON path** to that element in dot/bracket notation starting from `$`.

Examples:
- The value of a top-level key `"name"` → `$.name`
- The second element of an array at `$.store.books` → `$.store.books[1]`
- A deeply nested value → `$.x[1][1][0]`

The tooltip disappears when the cursor leaves the element.

## Parser Requirements

The app ships a custom JSON parser (or uses the backend for parsing). The parser must conform strictly to **RFC 8259**. In particular, note these requirements:

**Accept**:
- Unicode escape sequences (`\uXXXX`) — decoded and displayed as the corresponding character
- Surrogate pairs (`\uD83D\uDE00`) — decoded and shown as the correct Unicode character (e.g. 😀)
- The null character (`\u0000`) inside strings
- Escaped solidus (`\/`) in strings, decoded to `/`
- Numbers in scientific notation (`3.14e10`, `1E+2`)
- `-0`

**Must reject with an error message:**
- Trailing commas in objects or arrays
- Single-quoted strings
- Unquoted object keys
- Empty input (zero characters)
- Whitespace-only input

**Must preserve number text:** JavaScript's `JSON.parse` silently rounds integers that exceed `Number.MAX_SAFE_INTEGER`. Your application must not do this. When a number token in the source text cannot be represented exactly as a 64-bit float, display the number exactly as it appeared in the input, not as the rounded float. For example, `9999999999999999` must display as `9999999999999999`, not `10000000000000000`.

## API

The backend exposes a single endpoint. The frontend communicates with the backend to perform parsing, so that the custom parser lives server-side.


## Page Structure

The entire app lives at **`/`**. There are no other routes.

---

## `data-testid` Reference

Every interactive and observable element must carry the exact `data-testid` listed below.

### Input panel

- `json-input` — the JSON textarea
- `parse-btn` — the Parse button
- `prettify-btn` — the Format / Prettify button
- `minify-btn` — the Minify button

### Output panel

- `tree-view` — the container wrapping the rendered tree (present only when the last parse succeeded)
- `expand-all-btn` — the Expand All button (present only when the tree view is visible)
- `collapse-all-btn` — the Collapse All button (present only when the tree view is visible)
- `error-banner` — the red error container (present only when the last parse failed)
- `error-message` — the error text inside the banner

### Tree nodes

Each rendered row in the tree carries attributes that let tests identify it:

- `data-testid="tree-node"` — every node row, with a `data-path` attribute set to the JSON path of that node (e.g. `data-path="$.store.books[1].title"`)
- `data-testid="node-toggle"` — the collapse/expand toggle on object and array nodes; also carries `data-path`
- `data-testid="node-key"` — the key label within a row; also carries `data-path`
- `data-testid="node-value"` — the value display for leaf nodes (strings, numbers, booleans, null); also carries `data-path`

### Tooltip

- `value-tooltip` — the tooltip overlay (rendered in the DOM only while a value is being hovered)
- `tooltip-path` — the JSON path string displayed inside the tooltip
