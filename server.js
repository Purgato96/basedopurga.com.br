import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const port = process.env.PORT || 3000

// Servir arquivos estáticos da build
app.use(express.static(join(__dirname, 'dist')))

// Fallback para SPA (history mode)
app.get(/.*/, (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`Frontend rodando na porta ${port}`)
})
