# Pronto Gestor 0.5.0 — teste local Windows

Atualize em **Minha loja → Atualizações** (0.3.0+) ou feche pela bandeja e execute **Reparar-Pronto-0.5.0.exe**. O banco em APPDATA é preservado; confira a impressão automática ao abrir novamente.

Para instalar do zero, extraia o ZIP inteiro desta branch e execute **Instalar.cmd**. As três partes são unidas, o SHA-256 é conferido e o instalador é aberto. Windows x64; Node e servidor incluídos. Operação local, nenhuma VPS alterada.

## Mudanças

- Corrige o bloqueio de endereços e CEP no executável; remove o bloco de conexão de Minha loja.
- Lançamento ampliado com campos completos e rolagem acessível; editor de impressão sem alargar a página e prévia fixa nas telas largas.
- Seleção limitada pelo saldo disponível, somando variações do mesmo produto. Motivo de ajuste de estoque opcional.
- Ordenação de produtos, grupos e opções; ordem própria de grupos no produto.
- Importar/exportar catálogo JSON para outro computador, com prévia, validação e preservação de histórico/estoque.
- Geral + batata + balcão = duas comandas de cozinha, mais balcão separado da numeração.
- Comandas agrupadas por categoria em ordem configurável; caixas por item ou categoria inteira; negrito e fonte maior mesmo com quantidade 1.

49 testes passaram. Pacote verificado; nove recursos extraídos do atualizador conferidos por SHA-256. Interface testada na ponte real do Electron em Linux, incluindo endereços, estoque sem motivo, importação/exportação, ordenação e caixa da categoria inteira. Seletores/carrinho a 390 px conferidos. Instalação nativa Windows e impressão física na Elgin precisam de validação no restaurante.

## Cardápio Ecta

A cópia do catálogo LojaDosSonhos está **pendente**: o endereço público retornou HTTP 403. Nenhum JSON inventado foi incluído como cópia. Envie exportação ou HTML/dados públicos salvos da página para a conversão. A importação Pronto está pronta; veja TRANSFERIR-CARDAPIO.md.

Código: https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor . Pacote sem banco da loja e credenciais. Hashes em SHA256SUMS.txt. Guias: COMECAR-AQUI.md, IMPRESSAO.md e ORDENACAO-E-COMANDAS.md.
