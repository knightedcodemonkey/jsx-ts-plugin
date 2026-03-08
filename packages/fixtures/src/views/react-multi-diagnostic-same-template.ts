import { reactJsx } from '@knighted/jsx/react'

type CardProps = {
  title: string
  count: number
}

const Card = ({ title, count }: CardProps) =>
  reactJsx`<article>${title} · ${count}</article>`

export const ReactMultiDiagnosticSameTemplate = () =>
  reactJsx`
    <${Card} title=${123} count=${'oops'} />
  `
