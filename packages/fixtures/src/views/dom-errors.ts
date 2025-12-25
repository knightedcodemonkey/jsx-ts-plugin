import { jsx } from '@knighted/jsx'

export const DomErrors = () =>
  jsx`
    <div class="dom-errors">
      <button onClick=${'not a handler'} disabled="true">
        Invalid DOM props
      </button>
    </div>
  `
