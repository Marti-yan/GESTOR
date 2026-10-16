# Pronto Gestor 0.3.0 — teste local Windows

## Atualizar uma instalação existente

Feche pela bandeja e [baixe Reparar-Pronto-0.3.0.exe](https://github.com/Marti-yan/GESTOR/raw/refs/heads/downloads/windows-mvp-0.3.0/Reparar-Pronto-0.3.0.exe). Ele substitui aplicativo, API e interface com hashes conferidos, preservando pedidos e configurações em APPDATA. Confira **0.3.0** na barra de título.

A versão 0.2.0 não tinha atualização integrada. Depois deste primeiro arquivo, use **Minha loja → Atualizações do gestor → Buscar atualização** para consultar as próximas versões. Internet é necessária para baixar; a operação dos pedidos continua local, sem VPS.

## Instalar do zero

[Baixe o ZIP completo](https://github.com/Marti-yan/GESTOR/archive/refs/heads/downloads/windows-mvp-0.3.0.zip), escolha **Extrair tudo** e abra **Instalar.cmd**. Ele une as três partes e verifica o SHA-256 do instalador. Windows de 64 bits; servidor e Node.js incluídos.

## O que mudou

- Editor de comanda em três passos, com prévia e indicação de alterações pendentes.
- Espaço extra entre linhas em milímetros, que funciona inclusive em letra grande.
- Modelos prontos: geral, batata e balcão opcional. Confira as impressoras e produtos selecionados na batata.
- Total bem grande e posição de cada via: **2 COMANDAS — VIA 1/2**, **3 COMANDAS — VIA 2/3**. Aviso obrigatório em todas as vias.
- Destaques por categoria e grupo de adicionais: negrito, caixinha ou fundo preto.
- Complementos e adicionais com preços por unidade, mínimos, máximos e limites por opção, disponíveis no cardápio, gestor e garçom.
- Cozinha como padrão; caixa pequena para acrescentar uma via do balcão, inclusive pelo resumo do pedido do cardápio.
- Download de atualizações pela main/master do GitHub, com tamanho e SHA-256 conferidos antes da instalação.

## Conferir antes de atender

Siga [COMECAR-AQUI.md](COMECAR-AQUI.md), [IMPRESSAO.md](IMPRESSAO.md) e [ATUALIZACOES.md](ATUALIZACOES.md). Instale o driver da Elgin i8 USB, selecione 80 mm/ESC-POS, salve e teste. Confira itens, observações, contagem de comandas e **FIM** antes de ativar a impressão automática.

Ao instalar pela atualização integrada, o aplicativo fecha e a impressão automática é pausada. Conclua o assistente, abra o gestor e confira antes de reativar.

33 testes passaram, incluindo migrações 0.1/0.2, fila, múltiplas vias, adicionais, espaçamento e atualizador. A interface foi conferida em Electron/Linux: prévia com 280 px de diferença entre espaçamentos, seleção obrigatória de adicionais, preços e três comandas com batata e balcão. O atualizador foi extraído e seus recursos comparados ao manifesto de hashes.

A impressão física e a instalação nativa no Windows ainda precisam de validação com a Elgin. O executável não possui certificado comercial de assinatura. O PWA no celular exige HTTPS para instalar; o navegador funciona na LAN HTTP.

Código: [projeto](https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor). O pacote não contém banco da loja ou credenciais. Hashes: [SHA256SUMS.txt](SHA256SUMS.txt).
