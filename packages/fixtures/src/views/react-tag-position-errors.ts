import { reactJsx } from '@knighted/jsx/react'

const NotAComponent = 42

export const ReactTagPositionErrors = () =>
  reactJsx`
    <${NotAComponent} label="oops" />
  `
