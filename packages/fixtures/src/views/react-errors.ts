import { reactJsx } from '@knighted/jsx/react'

const Badge = ({ label }: { label: string }) => reactJsx`<span>${label}</span>`
export const ReactErrors = () =>
  reactJsx`
    <section class="react-errors">
      <${Badge} label=${123} />
    </section>
  `
