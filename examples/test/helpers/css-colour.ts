/**
 * Just enough CSS to compute the colours a stylesheet's custom properties
 * resolve to, for contrast tests over a cascade of variable layers (the docs
 * theme: VitePress' own variables, then the docs' mapping onto `--cd-*`).
 *
 * Supported values: `#rgb`/`#rrggbb`/`#rrggbbaa`, `rgb()`/`rgba()`,
 * `transparent`, `var(--name[, fallback])` and `color-mix(in srgb, …)`.
 * Anything else throws, so a value the maths can't read fails loudly instead
 * of passing by accident.
 */

export type Rgba = { r: number; g: number; b: number; a: number }
export type Decls = Record<string, string>
/**
 * One rule block: its selector list, its custom properties (`decls`), every
 * declaration including the standard ones (`props`, the last of a repeated
 * property winning) and its position in the stylesheet (`index`).
 */
export type CssBlock = { selector: string; decls: Decls; props: Decls; index: number }

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

const norm = (s: string) => s.replace(/\s+/g, " ").trim()

/**
 * The innermost rule blocks of a stylesheet in source order. An at-rule
 * wrapper (`@media … { :root { … } }`) is dropped: the block reports its own
 * selector.
 */
export function cssBlocks(css: string): CssBlock[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "")
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match, index) => {
    const selector = norm((match[1] ?? "").split(";").pop() ?? "")
    const decls: Decls = {}
    const props: Decls = {}
    for (const decl of (match[2] ?? "").split(";")) {
      const at = decl.indexOf(":")
      const name = decl.slice(0, at).trim()
      if (at <= 0) continue
      const value = norm(decl.slice(at + 1))
      props[name] = value
      if (name.startsWith("--")) decls[name] = value
    }
    return { selector, decls, props, index }
  })
}

/** The custom properties of every block whose selector is exactly `selector`, later ones winning. */
export function layer(blocks: CssBlock[], selector: string): Decls {
  const found = blocks.filter((b) => b.selector === norm(selector))
  if (found.length === 0) throw new Error(`no block "${selector}"`)
  return Object.assign({}, ...found.map((b) => b.decls)) as Decls
}

/** `a, b(c, d), e` → `["a", "b(c, d)", "e"]`: split at top-level commas. */
function splitArgs(args: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ""
  for (const ch of args) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  out.push(current.trim())
  return out
}

function hex(value: string): Rgba {
  const h = value.slice(1)
  const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(full)) throw new Error(`bad hex ${value}`)
  const byte = (i: number) => parseInt(full.slice(i, i + 2), 16)
  return { r: byte(0), g: byte(2), b: byte(4), a: full.length === 8 ? byte(6) / 255 : 1 }
}

function rgbFunction(inner: string): Rgba {
  const parts = inner
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => (p.endsWith("%") ? parseFloat(p) / 100 : parseFloat(p)))
  const [r, g, b, a = 1] = parts
  if ([r, g, b, a].some((n) => n === undefined || Number.isNaN(n))) {
    throw new Error(`bad rgb(${inner})`)
  }
  return { r: r as number, g: g as number, b: b as number, a }
}

/** `color-mix(in srgb, A p%, B q%)` with premultiplied alpha (CSS Color 5). */
function colorMix(inner: string, resolve: (value: string) => Rgba): Rgba {
  const [space, first, second] = splitArgs(inner)
  if (space !== "in srgb" || !first || !second) throw new Error(`unsupported color-mix(${inner})`)
  const parse = (arg: string) => {
    const m = /^(.*?)(?:\s+(\d*\.?\d+)%)?$/.exec(arg)
    return { colour: resolve(m?.[1] ?? arg), pct: m?.[2] ? parseFloat(m[2]) / 100 : null }
  }
  const one = parse(first)
  const two = parse(second)
  let p1 = one.pct ?? (two.pct === null ? 0.5 : 1 - two.pct)
  let p2 = two.pct ?? 1 - p1
  const sum = p1 + p2
  p1 /= sum
  p2 /= sum
  const a = one.colour.a * p1 + two.colour.a * p2
  if (a === 0) return TRANSPARENT
  const channel = (k: "r" | "g" | "b") =>
    (one.colour[k] * one.colour.a * p1 + two.colour[k] * two.colour.a * p2) / a
  return { r: channel("r"), g: channel("g"), b: channel("b"), a: a * Math.min(1, sum) }
}

/**
 * A resolver over the given layers (first = lowest priority): `colour("--x")`
 * is the colour custom property `--x` computes to.
 */
export function createColourResolver(layers: Decls[]): (name: string) => Rgba {
  const decls: Decls = Object.assign({}, ...layers) as Decls
  const resolveValue = (value: string, seen: string[]): Rgba => {
    const v = value.trim()
    if (v === "transparent") return TRANSPARENT
    if (v.startsWith("#")) return hex(v)
    const fn = /^([a-z-]+)\(([\s\S]*)\)$/.exec(v)
    if (!fn) throw new Error(`unsupported colour value "${v}" (via ${seen.join(" → ")})`)
    const [, name, inner = ""] = fn
    if (name === "rgb" || name === "rgba") return rgbFunction(inner)
    if (name === "color-mix") return colorMix(inner, (arg) => resolveValue(arg, seen))
    if (name === "var") {
      const [ref = "", fallback] = splitArgs(inner)
      return resolveName(ref, fallback, seen)
    }
    throw new Error(`unsupported colour function ${name}()`)
  }
  const resolveName = (name: string, fallback: string | undefined, seen: string[]): Rgba => {
    if (seen.includes(name)) throw new Error(`cycle: ${[...seen, name].join(" → ")}`)
    const value = decls[name] ?? fallback
    if (value === undefined) throw new Error(`undefined ${name} (via ${seen.join(" → ")})`)
    return resolveValue(value, [...seen, name])
  }
  return (name) => resolveName(name, undefined, [])
}

/** `top` composited over `bottom` (source-over). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a)
  if (a === 0) return TRANSPARENT
  const channel = (k: "r" | "g" | "b") => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a
  return { r: channel("r"), g: channel("g"), b: channel("b"), a }
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2.x contrast of `fg` drawn on the opaque `bg` (fg composited first). */
export function contrast(fg: Rgba, bg: Rgba): number {
  if (bg.a < 1) throw new Error("contrast needs an opaque background")
  const l1 = luminance(over(fg, bg))
  const l2 = luminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
