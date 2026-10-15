Pronto Gestor 0.2.0: pedidos por cardápio, garçom e gestor, com impressão térmica configurável.

- Cardápio imprime após aceitar; garçom/gestor entram aceitos e na fila.
- Garçom com PIN, mesa, senha, quantidades, observações, troco e próprios pedidos.
- Categorias e itens com preferências independentes de lista/cards no lançamento interno.
- Categorias cadastráveis, renomeáveis e ordenáveis; cardápio público em listas agrupadas.
- Envio ESC/POS RAW à Elgin i8, conteúdo completo e um corte no final; alternativa HTML.
- Modelos Expedição, Cozinha e Compacta por saída, com prévia e destaques configuráveis.
- Botões do quadro avançam sem abrir o resumo.
- Atualizador preserva dados e substitui aplicativo, API e interface com verificação de hashes.

Para atualizar uma instalação existente, feche o aplicativo pela bandeja e execute `Reparar-Pronto-0.2.0.exe`. Para instalar do zero, use o instalador completo. Ao abrir, confira a versão 0.2.0 na barra de título.

O teste inicial continua local, sem VPS. Celular e gestor precisam estar na mesma rede. No celular por HTTP, use o navegador; instalação como PWA exige HTTPS. Pagamentos são registrados para recebimento presencial, sem confirmação online.

Consulte `COMECAR-AQUI.md` e `IMPRESSAO.md`. A Elgin física e o envio nativo Windows precisam de validação no equipamento. O aplicativo não possui certificado comercial de assinatura.
