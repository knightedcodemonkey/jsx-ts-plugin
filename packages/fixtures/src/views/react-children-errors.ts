import { reactJsx } from '@knighted/jsx/react'

const NeedsText = ({ children }: { children: string }) => reactJsx`<p>${children}</p>`

export const ReactChildrenErrors = () =>
  reactJsx`
    <${NeedsText}>${reactJsx`<strong>not text</strong>`}</${NeedsText}>
  `
