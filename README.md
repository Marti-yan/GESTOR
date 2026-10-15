# Pronto Gestor 0.2.0 — teste local Windows

## Atualizar

Feche o Pronto pela bandeja e [baixe Reparar-Pronto-0.2.0.exe](https://github.com/Marti-yan/GESTOR/raw/refs/heads/downloads/windows-mvp-0.2.0/Reparar-Pronto-0.2.0.exe). O atualizador substitui aplicativo, API e interface e verifica os hashes. Preserva pedidos, senha e configurações em `%APPDATA%\Pronto Gestor`. Ao abrir, confira **Pronto Gestor — 0.2.0** na barra de título. O arquivo tem aproximadamente 2 MB e exige uma instalação anterior.

## Instalar do zero

[Baixe o ZIP completo](https://github.com/Marti-yan/GESTOR/archive/refs/heads/downloads/windows-mvp-0.2.0.zip), escolha **Extrair tudo** e abra **Instalar.cmd**. Ele une as três partes, verifica o SHA-256 e abre o instalador. Windows de 64 bits; servidor e Node.js incluídos. O computador original não precisa estar disponível. Cada computador mantém seu próprio banco.

## Novidades

- Garçom com PIN, mesa, senha, observações, troco e acompanhamento dos próprios lançamentos.
- Categorias e itens em módulos, com preferências independentes de lista/cards: quatro combinações salvas por aparelho.
- Cadastro e ordem das categorias, produtos por categoria e cardápio público em listas agrupadas.
- Pedidos do cardápio imprimem após o aceite; garçom e gestor entram aceitos e na fila.
- Botões do quadro avançam sem abrir o resumo.
- ESC/POS RAW para Elgin i8, conteúdo completo e um corte no final; alternativa HTML pelo driver.
- Modelos por saída com prévia, destaques para quantidades, observações, mesa, senha, bebidas e troco, além de fonte, recuo, avanços e guilhotina.

## Testar

Siga [COMECAR-AQUI.md](COMECAR-AQUI.md) e [IMPRESSAO.md](IMPRESSAO.md). O teste é local, sem VPS. Celular e gestor precisam estar no mesmo Wi-Fi. Por HTTP no celular, use o navegador; instalar como PWA exige HTTPS. O pedido depende da conexão, e rascunhos ficam salvos no aparelho.

Em Impressão, selecione a Elgin, 80 mm e modo ESC/POS. Teste e confira o marcador **FIM DA COMANDA #123** antes de ativar a impressão automática. O computador principal precisa permanecer ligado.

## Validação

22 testes automatizados passaram, junto com TypeScript, build e verificação do pacote. O Electron foi exercitado em Linux com os recursos finais: aceite sem abrir resumo, lançamento pelo gestor e garçom, quatro visualizações e persistência das preferências, rascunho limpo após envio, prévia e cardápio mobile sem transbordamento. Os arquivos extraídos do atualizador correspondem ao manifesto de hashes.

O instalador e a ponte nativa Windows ainda precisam ser conferidos em Windows real com a Elgin física. O aplicativo não possui certificado comercial de assinatura. Os hashes estão em [SHA256SUMS.txt](SHA256SUMS.txt).

Código e documentação: [projeto](https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor). O ZIP de código não contém banco nem credenciais.
