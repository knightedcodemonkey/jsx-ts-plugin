import { reactJsx } from '@knighted/jsx/react'

const NeedsText = ({ children }: { children: string }) => reactJsx`<p>${children}</p>`

export const ReactChildrenPropErrors = () =>
  reactJsx`
    <${NeedsText} children=${123} />
  `
