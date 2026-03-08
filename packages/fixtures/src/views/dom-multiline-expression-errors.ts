import { jsx } from '@knighted/jsx'

const badHandlerValue: number = 123

export const DomMultilineExpressionErrors = () =>
  jsx`
    <button
      onClick=${badHandlerValue}
      class="dom-multiline-errors"
    >
      Broken handler
    </button>
  `
