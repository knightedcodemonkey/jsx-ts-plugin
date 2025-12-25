import { reactJsx } from '@knighted/jsx/react'

type CardProps = {
  title: string
  description: string
  footer: string
}

export const ReactCard = ({ title, description, footer }: CardProps) =>
  reactJsx`
    <article class="react-card">
      <header>
        <h3>${title}</h3>
      </header>
      <section>
        <p>${description}</p>
      </section>
      <footer>
        <span>${footer}</span>
      </footer>
    </article>
  `
