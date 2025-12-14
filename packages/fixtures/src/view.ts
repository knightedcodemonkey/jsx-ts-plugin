import { jsx } from '@knighted/jsx'

const Foo = (props: { label: string }) => props

const view = jsx`
  <>
    <${Foo} label=${123} />
    <div foo="bar" />
  </>
`

export { view }
