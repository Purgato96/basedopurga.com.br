import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const port = process.env.PORT || 3000

app.use(express.static(join(__dirname, 'dist')))

app.get(/.*/, (req, res) => {

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.sendFile(join(__dirname, 'dist', 'index.html'), {
    etag: false
  });
})

app.listen(port, () => {
  console.log(`Frontend rodando na porta ${port}`)
})
