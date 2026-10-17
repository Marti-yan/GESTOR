# Validação do MVP 0.1.2

Data: 15/10/2026. Ambiente de desenvolvimento e build: Linux, Node.js 24.

## Correção 0.1.2 e reparador

O usuário relatou a mesma importação antiga depois de instalar a versão 0.1.1. Os artefatos publicados continham o código corrigido, mas o código antigo continuava sendo executado no Windows. A versão 0.1.2 inclui o gerador de comanda e o agente no próprio arquivo do processo principal; o instalador completo e o reparador agora gravam os arquivos críticos diretamente e conferem seu SHA-256 no destino. Se o programa estiver em execução, o instalador pede que seja fechado; se a escrita ou o hash falhar, a atualização é interrompida.

- Reparador nativo NSIS de aproximadamente 1,8 MB gerado.
- Conteúdo do reparador extraído e comparado ao pacote: `app.asar`, API e manifesto de versão/hashes correspondem.
- Execução do novo `app.asar` e da API em Electron/Node Linux, com o arquivo externo `shared/receipt.cjs` ausente: abertura, login, pedido anterior preservado, novo pedido visível e janela de comanda passaram.
- Os 12 testes automatizados e a compilação de produção passaram.
- O teste Linux não comprova o comportamento do instalador/reparador em Windows real. A cópia e o SHA-256 no destino são verificações incluídas nos executáveis; não houve uma execução nativa Windows neste ambiente.

## Verificações concluídas

- TypeScript e compilação de produção da interface.
- 12 testes automatizados de API e impressão, todos aprovados, incluindo abertura da página inicial a partir de diretório oculto.
- Checkout real no Chromium: produto, observação, identificação do cliente e confirmação.
- Acompanhamento pelo link exclusivo do pedido.
- Configuração inicial da senha e acesso ao gestor pelo navegador.
- Recebimento do pedido no gestor e avanço por preparo, pronto e finalizado.
- Visualização de comanda com preservação das observações.
- Layout de celular de 390 px, sem rolagem horizontal no cardápio.
- Nenhum erro de JavaScript capturado durante o fluxo de navegador.
- Bundle do servidor: catálogo, criação de pedido, acompanhamento, SQLite e arquivos da interface.
- Aplicativo Electron executado em Linux com display virtual: servidor incluído, criação inicial da senha, bridge IPC, login e enumeração nativa de impressoras.
- Integração completa no Electron com impressora simulada: novo pedido → reserva → renderização da comanda → chamada nativa com `silent: true` e largura de 80 mm → aceite salvo. Apenas um envio foi observado. A chamada física foi substituída por uma simulação neste teste.
- Modelo de comanda em PDF com largura de 80 mm e altura calculada pelo conteúdo.
- Diário de impressão: uma confirmação perdida é recuperada sem novo envio físico.
- Diário de impressão: reinício durante o envio gera resultado incerto, sem reimpressão automática.
- Reserva concorrente de trabalhos e separação de comandas por setor.
- Instalador Windows NSIS gerado; integridade do arquivo verificada com 7-Zip e correspondência do código/interface empacotados conferida.
- A falha `Cannot find module '../shared/receipt.cjs'` foi reproduzida no pacote 0.1.0 e corrigida com o carregamento a partir de `process.resourcesPath`.
- A verificação de dependências do pacote final é executada automaticamente em `afterPack`, antes de gerar o instalador; o pacote antigo falhou nessa verificação e o novo passou.
- O `app.asar`, o bundle da API, a interface e o módulo de comanda da distribuição Windows 0.1.1 foram executados com Electron Linux e Node Linux, em pasta de teste separada. Nesse modo empacotado: tela inicial, senha por IPC, pedido pelo endpoint público, pedido visível no gestor e janela de comanda passaram. Apenas os executáveis nativos foram substituídos pelos equivalentes Linux nesse teste; isso não equivale a executar o instalador no Windows.

## Limites da validação

- O instalador Windows é gerado por compilação cruzada. Não houve execução em um computador Windows real neste ambiente.
- Não havia uma Elgin i8 USB conectada. Impressão silenciosa foi implementada com a API do Electron, mas a saída física, o driver e o corte precisam do teste no equipamento do restaurante.
- O recebimento a partir de um celular físico na rede da loja depende de IP, firewall e configuração do Wi-Fi. O layout e as requisições foram exercitados no navegador automatizado.
- Nenhum site foi publicado em Hostinger ou Sites. A entrega inicial executa o servidor incluído e o cardápio na rede local. O caminho de publicação externa está documentado.
- Nenhuma integração com marketplace, WhatsApp ou pagamento online foi simulada como se estivesse ativa.
- O teste atual permanece local, conforme solicitado. A VPS Integrator Host e o Atende Chat não foram acessados ou alterados.

## Evidências locais

As capturas de cardápio, gestor, impressão e a comanda PDF estão na pasta `artifacts/` do workspace. O pedido usado nas capturas é explicitamente um **pedido de teste QA**. O banco de testes e as sessões não entram no pacote de código nem no instalador.

## Aceite no restaurante

1. Instalar/abrir o aplicativo no Windows e criar a senha.
2. Configurar o driver da Elgin i8 e enviar a comanda de teste.
3. Abrir o QR Code em um celular da mesma rede.
4. Criar um pedido com observação, verificar o valor e conferir a impressão.
5. Desconectar a impressora, enviar outro pedido e verificar o erro/fila.
6. Reconectar, conferir o papel e solicitar o reenvio controlado.
7. Encerrar pela bandeja, abrir novamente e verificar a persistência dos pedidos.
