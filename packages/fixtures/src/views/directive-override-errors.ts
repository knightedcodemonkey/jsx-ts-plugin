import { jsx } from '@knighted/jsx'
import { reactJsx } from '@knighted/jsx/react'

const Badge = ({ label }: { label: string }) => reactJsx`<span>${label}</span>`

// @jsx-react
export const ReactDirectiveOverrideError = () => jsx`<${Badge} label=${123} />`

/* @jsx-dom */
export const DomDirectiveOverrideError = () =>
  reactJsx`<button onClick=${'not a handler'}>Broken</button>`
