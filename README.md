# Caramelo Live — Analisador Over 3.5 / 5+ ao vivo

Site que busca a API pública do caramelo a cada 15s, calcula tudo no servidor
(sem CORS, sem travar) e mostra ao vivo no navegador.

## O que ele mostra
- % real que paga o mercado (base) e a odd justa
- Termômetro de formação 120/240/480/960 (quando a 120 sobe = esquentando)
- Ranking de odds com EV (verde = vale, vermelho = cara)
- Assinatura atual dos últimos 5 jogos e quanto ela costuma pagar depois
- Top assinaturas que mais pagam (explora a repetição apesar da variância)

Atualiza sozinho a cada 10s. Ligas: Euro, Copa, Super, Premier. Mercados: Over 3.5, 5+, Over 2.5.

## Como subir no Render (grátis)

1. Crie uma conta em https://render.com (pode entrar com o GitHub)
2. Suba esta pasta para um repositório no seu GitHub
   (ou use a opção de upload manual do Render)
3. No Render: New + → Web Service → conecte o repositório
4. Configure:
   - Environment: Node
   - Build Command: npm install
   - Start Command: npm start
5. Clique Create Web Service. Em ~2 min o site estará no ar com uma URL tipo
   https://caramelo-live.onrender.com

Pronto. Abra a URL no celular ou PC e analise ao vivo.

## Rodar local (teste)
```
npm install
npm start
```
Abre http://localhost:3000

## Observação
O plano grátis do Render "dorme" após 15 min sem acesso e leva ~30s pra acordar
no primeiro acesso. Para uso intenso, o plano pago (US$7/mês) mantém sempre ligado.
