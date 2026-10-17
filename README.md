# Pronto Gestor 0.4.0 — teste local Windows

Atualize em **Minha loja → Atualizações** (a partir da 0.3.0), ou feche pela bandeja e execute **Reparar-Pronto-0.4.0.exe**. O banco em APPDATA é preservado. Confira a impressão automática ao reabrir.

Para instalar do zero, extraia todo o ZIP desta branch e abra **Instalar.cmd**. As três partes binárias são unidas e o SHA-256 é verificado antes da instalação. Windows x64; Node e servidor incluídos. Nenhuma VPS é necessária para o teste local.

## Funcionalidades novas

- Relatórios com filtros, indicadores, agrupamentos, tempos e CSV de resumo/pedidos/itens.
- Limite de estoque por produto, reserva transacional no envio e histórico. Pedidos simultâneos não excedem o saldo.
- Cancelamento antes do preparo devolve reserva; depois do aceite, reposição manual.
- CEP opcional via ViaCEP, endereço manual, cidades/bairros cadastrados na loja.
- Entrega no lançamento do gestor e garçom; fluxo de impressão preservado.

40 testes passaram. Pacote e recursos extraídos do atualizador conferidos por hash. Interface conferida em Electron/Linux, incluindo pedido de entrega, relatórios/CSV e formulário de endereço a 390 px. ViaCEP foi simulado nos testes: a consulta externa real e a impressão física devem ser conferidas no computador Windows.

Estoque por produto, sem ficha técnica compartilhada. Relatórios são de pedidos, sem confirmação financeira/CMV/lucro. Cidades/bairros são sugestões, mantendo a taxa geral de entrega. Leia **RELATORIOS-ESTOQUE-ENDERECOS.md**.

Código: https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor . O pacote não contém banco da loja ou credenciais. Veja SHA256SUMS.txt.
