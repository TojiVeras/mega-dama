# Damas 3D

Damas brasileiras em 3D para dois jogadores no mesmo computador/celular. A câmera troca de lado a cada turno.

- Segure e arraste a peça até a casa desejada (ou clique na peça e depois na casa).
- As casas possíveis brilham (azul = movimento, laranja = captura); anéis amarelos marcam peças que precisam capturar.
- Botão direito gira a câmera, roda do mouse dá zoom.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173.

## Publicar grátis

### GitHub Pages (automático)

1. Crie um repositório no GitHub e envie o projeto:
   ```bash
   git init
   git add .
   git commit -m "Damas 3D"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/damas-3d.git
   git push -u origin main
   ```
2. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. O workflow publica em `https://SEU_USUARIO.github.io/damas-3d/` a cada push na `main`.

### Netlify (sem Git)

```bash
npm run build
```

Arraste a pasta `dist/` em https://app.netlify.com/drop.

### Vercel / Cloudflare Pages

Importe o repositório; comando de build `npm run build`, pasta de saída `dist`.
