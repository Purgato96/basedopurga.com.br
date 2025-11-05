import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const port = process.env.PORT || 3000

// -------------------------------------------------------------------
// PASSO 1: Servir assets (JS, CSS, imagens)
// -------------------------------------------------------------------
// Nós dizemos ao Express para cachear esses arquivos, pois eles
// têm hashes (ex: app.a1b2c3d4.js) e não mudam.
app.use(express.static(join(__dirname, 'dist'), {
  index: false,     // NÃO deixe o static servir o index.html
  etag: true,       // USE Etag para assets (bom para cache)
  cacheControl: true, // Deixe o Express gerenciar o cache dos assets
  maxAge: '1y'      // Cache de 1 ano para assets
}))

// -------------------------------------------------------------------
// PASSO 2: Servir o 'index.html' (O Ponto de Entrada)
// -------------------------------------------------------------------
// Qualquer rota que não for um asset (ex: /chat/room/slug)
// cairá aqui. Nós servimos o index.html, mas forçamos
// o navegador a NUNCA usar o cache para ele.
app.get(/.*/, (req, res) => {
  // Headers para NUNCA cachear o index.html
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Envia o arquivo e desabilita o Etag APENAS para o index.html
  res.sendFile(join(__dirname, 'dist', 'index.html'), {
    etag: false
  });
})
// -------------------------------------------------------------------

app.listen(port, () => {
  console.log(`Frontend rodando na porta ${port}`)
})
