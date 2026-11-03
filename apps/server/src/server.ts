import { app, docsEnabled } from './index'

app.listen(3000)
console.log('API  → http://localhost:3000/api')
if (docsEnabled) console.log('Docs → http://localhost:3000/api/openapi')
