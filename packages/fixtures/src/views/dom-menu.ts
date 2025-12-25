import { jsx } from '@knighted/jsx'

type NavLink = {
  href: string
  label: string
  badge?: number
}

const links: NavLink[] = [
  { href: '#inbox', label: 'Inbox', badge: 22 },
  { href: '#assigned', label: 'Assigned', badge: 5 },
  { href: '#archived', label: 'Archived' },
]

export const DomMenu = () =>
  jsx`
    <nav class="dom-menu">
      <ul>
        ${links.map(
          ({ href, label, badge }) => jsx`
          <li>
            <a href=${href}>${label}</a>
            ${badge ? jsx`<span class="badge">${badge}</span>` : ''}
          </li>
        `,
        )}
      </ul>
    </nav>
  `
