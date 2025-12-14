import { jsx } from '@knighted/jsx'
import type { JsxRenderable } from '@knighted/jsx'

type DomBadgeProps = {
  label: JsxRenderable
}

export const DomBadge = ({ label }: DomBadgeProps): HTMLElement => {
  let clicks = 0
  const counterText = jsx`<span>Clicked ${clicks} times</span>` as HTMLSpanElement

  const badge = jsx`
    <article class="dom-badge">
      <header>
        <h2>Lit + DOM with jsx</h2>
        <p data-kind="react">${label}</p>
      </header>
      <button
        type="button"
        data-kind="dom-counter"
        onClick=${() => {
          clicks += 1
          counterText.textContent = `Clicked ${clicks} times`
        }}
      >
        ${counterText}
      </button>
    </article>
  ` as HTMLDivElement

  return badge
}

export const view = DomBadge({ label: 'Badge' })
