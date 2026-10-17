# Validação do Pronto Gestor 0.8.0

Data: 17/10/2026. Ambiente Linux, Node.js 24.19.0; instalador Windows x64 por compilação cruzada.

## Verificações automatizadas

`npm test`: **93 testes aprovados**, incluindo a base anterior de pedidos, estoque, relatórios, impressão, políticas do desktop, Atende Chat/WhatsApp, IA, entregadores, migrações e atualizador.

Novos cenários:

- Combo e avulso competem pelo saldo do componente, com rollback integral e devolução única antes do aceite.
- Componentes abrem a comanda da outra cozinha; balcão fora da contagem; snapshots de receita/setor preservados após editar o catálogo.
- Importação valida combos, preserva ordem/composição no JSON e oculta combo com componente indisponível.
- Conta por mesa soma lançamentos; total/versão concorrentes impedem fechamento desatualizado; rascunho da conta encerrada não entra no atendimento novo.
- Confirmação de entrega repetida/concorrente gera um evento e um registro de recebimento; ação do entregador anterior não passa após reatribuição.
- Localização do mesmo telefone em outro endereço não reaproveita o ponto antigo.
- Backup SQLite passa em integrity_check; restauração recupera pedidos e desativa filas/sessões antigas.
- Planilha conserva preços, aspas e categorias; sugestão de proximidade conserva todas as paradas.
- Catálogo Loja Dos Sonhos: 79 produtos, 15 categorias, preços fornecidos, ingredientes conhecidos vinculados, porções ambíguas como preparo, importação com arquivo/conta conferidos e duas comandas por combo.
- Testes de componentes em DOM simulado: balão no + e bloqueio ao atingir saldo, hidratação sem apagar o carrinho salvo, fila offline com mesmo identificador e limite de estoque compartilhado na seleção.
- Resposta HTTP inicial contém produtos/categorias sem esperar JavaScript; JSON público escapado contra fechamento de script; rotas privadas recebem shell separado.

`npm run build` verifica TypeScript, gera módulos Vite e o renderizador SSR do cardápio. O menu público não carrega os módulos do gestor, atendimento, IA ou mapa na primeira abertura. Há compressão HTTP e cache longo apenas nos assets com hash. Isso valida estrutura/tamanho; não é medição em 3G ou em celular físico.

## Pacote e publicação

O build Windows executa a verificação do app.asar, das dependências de inicialização e dos recursos (incluindo menu-ssr.cjs). O atualizador inclui hashes SHA-256 dos arquivos críticos, além da verificação do executável pelo canal de atualizações.

As verificações finais do pacote/download são registradas durante a publicação. Bancos, sessões, provider.key, credenciais, node_modules e artefatos de testes ficam fora do ZIP de código-fonte. O catálogo da loja contém apenas os dados comerciais fornecidos pelo usuário.

## Limites

Não houve execução nativa do instalador Windows, impressão física na Elgin i8, teste em celular real, login real no Precific nem homologação do backend real Atende Chat nesta versão. A conexão com a aba local Ecta não estava disponível: o catálogo foi transcrito do texto fornecido pelo proprietário, sem fotos ou grupos de opções não informados.

O teste permanece local; VPS Integrator Host e hospedagem Hostinger não foram acessadas ou alteradas. Uso externo em 4G, instalação PWA e GPS no celular exigem acesso HTTPS ao computador/servidor; não estão publicados apenas por instalar este executável. A fila offline não substitui o servidor nem garante armazenamento se o navegador apagar seus dados.

Roteiro de aceite e configuração: [OPERACAO-LOCAL-0.8.md](OPERACAO-LOCAL-0.8.md).
