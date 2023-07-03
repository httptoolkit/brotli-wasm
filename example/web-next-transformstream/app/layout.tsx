import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'TransformStream example',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/mvp.css" />
        <script src="https://unpkg.com/web-streams-polyfill/dist/polyfill.min.js"></script>
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
