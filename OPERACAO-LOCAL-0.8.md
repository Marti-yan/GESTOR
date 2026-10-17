# Pronto Gestor 0.8.0 — apresentação ao cliente sem VPS

A operação fica no computador da loja: API, SQLite, cardápio com HTML inicial, pedidos, mesas, estoque e fila de impressão. O celular precisa alcançar esse computador. Nenhum serviço foi publicado na Hostinger/VPS nesta versão.

## Roteiro para demonstrar em 10 minutos

1. Instale/atualize o gestor, faça login e abra **Cardápio**. Em **Levar o cardápio → Importar planilha / preparar uma demonstração**, clique em **Conferir exemplo fictício de combo**. Confira o resumo e confirme. Os exemplos têm “demonstração” no nome e preços ilustrativos.
2. Expanda **Configuração rápida: cozinha padrão + cozinha batata**. Marque Pastéis, Batatas e Porções e aplique. Essa ação atualiza os setores dos produtos e o filtro da comanda-batata, preservando a impressora e o estilo existentes. As outras categorias vão para **Cozinha**. Os pedidos antigos mantêm seus snapshots.
3. Em **Impressão**, selecione as impressoras físicas de **Comanda geral**, **Comanda-batata** e, se usar, **Via do balcão**. Pode testar dois modelos na mesma Elgin i8. A via do balcão não aumenta o número de comandas da cozinha. Para separar totalmente o preparo, altere a geral de “todos os itens” para o setor **Cozinha**; a via batata usa **Cozinha Batata**.
4. Abra o cardápio no celular da mesma rede e peça o combo de demonstração. O pedido público reserva estoque, fica em **Novos** e só imprime quando aceito. Confira o aviso grande **2 COMANDAS** e o marcador de fim antes da guilhotina.
5. Habilite o garçom e PIN em **Garçons**. No celular, escolha uma categoria e toque no lanche: o balão verde junto ao **+** confirma a adição. Para produtos com adicionais, ele aparece depois de confirmar as escolhas. Lance na mesa 12; vai para a cozinha automaticamente.
6. Em **Mesas**, abra a mesa 12 e adicione outro pedido. Marque os pedidos como prontos no gestor e como servidos na mesa. Confira a soma e o rateio informativo. Confirme que recebeu e encerre a mesa. O próximo atendimento na mesa 12 terá uma conta nova.
7. Cadastre um entregador com PIN e atribua um pedido de entrega. No portal dele, teste os filtros, contato com o cliente, retirada, ordem das paradas, mapa e confirmação de entrega. Para testar ausência de sinal, mantenha a tela aberta, desconecte o celular e registre uma etapa. Ela fica **pendente neste aparelho**, até o gestor confirmar ao reconectar.
8. Em **Minha loja → Backups locais**, crie uma cópia e confira a pasta/horário. Os arquivos não são enviados ao GitHub.

## Garçom

- Preferências independentes de lista/cards para categorias e itens: quatro combinações por aparelho.
- Rascunho local, quantidades com saldo compartilhado entre combos/avulsos, adicionais, observações, mesa, retirada ou entrega e via opcional de balcão.
- Balão no botão +, sacola e confirmação após envio; nenhum pedido é considerado enviado sem resposta do servidor.
- Mesas com conta acumulada entre lançamentos de diferentes atendentes, destaque para pronto, ação de servir e encerramento com versão/total conferidos novamente no servidor.
- A conta não encerra enquanto houver pedidos para preparar/servir. A divisão por pessoas é informativa; centavos restantes são mostrados. O recebimento é registrado manualmente, sem captura de cartão ou confirmação de Pix.
- Depois de encerrar, um rascunho ligado à conta antiga é rejeitado. Abra a mesa atual ou inicie outro atendimento.

## Combos e impressão

Em **Cardápio → Editar produto → Combo / promoção e outras cozinhas**, o produto principal é o lanche e mantém seu preço/setor. Acrescente produtos simples como acompanhamentos, com quantidade e ordem. O preço cadastrado no principal é o preço final do combo; os adicionais do principal somam normalmente. Os acompanhamentos não geram outra cobrança.

Exemplo fictício:

```text
2 COMANDAS                         (grande)
PEDIDO #123
1x Combo Explosão de Bacon
ACOMPANHA [Cozinha Batata]
BATATAS
- 1x Batata maluca
PORÇÕES
- 1x Salgadinhos
ACOMPANHA [Cozinha]
BEBIDAS
- 1x Refrigerante lata
```

Na via setorizada, a identificação do combo fica como referência e os acompanhamentos dessa cozinha recebem destaque **PREPARAR AQUI**. Os outros ficam marcados **OUTRA COZINHA** para conferência. Pedir dois combos multiplica os acompanhamentos. O mesmo pedido/contagem acompanha todas as vias. Na comanda geral de todos os itens, todos os componentes são listados.

O estoque de cada componente é reservado na mesma transação do pedido. Combo e venda avulsa consomem o mesmo saldo. Falta de qualquer componente rejeita o pedido inteiro sem deixar reserva parcial. Cancelamento antes do preparo devolve a reserva uma vez; após entrar em preparo, não repõe automaticamente insumos consumidos.

A versão cobre acompanhamentos fixos. Combos aninhados e componentes com escolhas obrigatórias são recusados; cadastre um produto fixo (por exemplo, um sabor específico de bebida). A escolha variável entre acompanhamentos e o estoque por ingrediente/ficha técnica continuam no roteiro.

## Entregador

- Acesso individual, pedidos atribuídos, filtros em andamento/a retirar/na rua/histórico e resumo de entregues hoje.
- Reordenar paradas manualmente e sugerir proximidade usando pontos confirmados. A sugestão usa distância em linha reta, sem trânsito, cálculo viário ou garantia de rota ótima.
- Navegação externa no Google Maps, com até 8 paradas já retiradas na rota montada. Pedidos sem coordenadas usam o endereço textual.
- Telefone/WhatsApp do cliente, observações, valor e troco, recebedor opcional, registro manual de pagamento recebido e ocorrência de entrega.
- Localização confirmada vinculada ao telefone **e ao endereço**. Outro endereço do mesmo telefone não herda o ponto antigo. Pontos legados sem vínculo de endereço precisam ser confirmados novamente.
- Ações pendentes persistidas no aparelho com identificador único. Uma resposta perdida pode ser repetida sem duplicar a etapa/evento/recebimento. Reatribuição, cancelamento ou mudança de versão geram conflito visível; não são sobrescritos silenciosamente. Só uma ação pendente por pedido; sincronize antes de lançar a próxima etapa.
- A fila não guarda nome/endereço/telefone, apenas identificadores e dados da confirmação. A lista de pedidos da API não entra no cache do PWA. Após reiniciar o app sem conexão, é preciso reconectar para validar a sessão e carregar a lista. A fila sobrevive ao fechamento, mas depende do armazenamento do navegador; não limpe os dados antes de sincronizar.
- O compartilhamento GPS continua opcional, com opção de parar e indicação de posição antiga. Navegadores não garantem rastreamento com tela bloqueada/em segundo plano.

## Cardápio rápido: HTML inicial e módulos

Mantivemos React e o servidor Express já embutido no `.exe`, acrescentando **renderização no servidor (SSR)** do menu. A primeira resposta de `/` já contém loja, categorias, itens e preços. React hidrata os controles; depois busca disponibilidade atual e o backend valida novamente no checkout. O carrinho salvo é recuperado após hidratar, sem divergência entre HTML inicial e navegador.

Gestor, garçom, atendimento, IA e mapa são módulos separados. O menu público não importa esses módulos na abertura. Há compressão HTTP, cache longo para assets com hash e renderização adiada das seções fora da tela. HTML e APIs de dados não recebem cache longo; a API nunca entra no service worker.

A preferência por Next.js era para ter conteúdo pronto antes do JavaScript. Esse resultado foi implementado no processo local existente. Migrar todo o gestor para Next agora acrescentaria outra estrutura de build/runtime e trabalho de integração sem ser necessário para esse objetivo. Não há um projeto Next paralelo ou hospedagem nova nesta entrega. Desempenho em 3G e celulares reais ainda precisa ser medido; tamanho de bundle não é medição de tempo de abertura.

## Cardápio Loja dos Sonhos

O endereço solicitado é `https://ecta.com.br/LojaDosSonhos/#/restaurante2`. O ambiente retornou bloqueio 403 e a ferramenta de leitura web não conseguiu abrir o site; a aba local compartilhada não ficou acessível. **O cardápio real não foi copiado.** Não inventamos produtos, adicionais ou preços em nome da loja.

Está pronta a importação JSON e a importação de planilha com cabeçalho:

```csv
categoria;nome;descricao;preco;cozinha
Batatas;Produto real;Descrição real;19,90;
```

Aceita `;` ou tabulação e campos entre aspas. A cozinha pode ficar vazia: Pastéis/Batatas/Porções são roteados para Cozinha Batata, as outras categorias para Cozinha. JSON permite preservar grupos, opções e combos. O resumo de importação é conferido antes de alterar a loja. `examples/cardapio-demonstracao.json` é explicitamente fictício, destinado à apresentação.

## Backups e recuperação

O servidor cria uma cópia local ao iniciar se ainda não existir uma daquele dia e mantém as 7 mais recentes. **Criar backup agora** gera outra cópia consistente via SQLite e verifica integridade. Não é um agendamento contínuo durante dias sem reiniciar o servidor. A pasta fica junto ao banco e aparece em Minha loja; copiar para outro disco continua necessário para proteger contra falha física do PC.

A restauração é uma ferramenta offline do código-fonte:

```bash
node scripts/restore-backup.mjs CAMINHO_DO_BACKUP.sqlite PASTA_DO_BANCO --gestor-fechado
```

Encerre o gestor pela bandeja antes. O script recusa banco com WAL/SHM em uso, valida o arquivo, preserva uma cópia do banco substituído e prepara a restauração em outro arquivo. Pedidos são recuperados; trabalhos de impressão ficam **incertos/para conferir**, mensagens/IA pendentes são desativadas, campanhas/agente pausados, sessões revogadas e GPS encerrado. Ações offline antigas do entregador recebem conflito após a troca da identificação do banco. Confira o papel antes de solicitar uma reimpressão.

O backup `.sqlite` contém dados pessoais e configurações sensíveis; mantenha-o privado. Credenciais de integração são criptografadas com `provider.key`, que não está dentro desse arquivo: preserve essa chave separadamente para restaurar integrações no computador original ou reconfigure as credenciais no novo computador. Não mande banco ou chave para o repositório público.

## Limites sem VPS

| Uso | Funciona agora? | Condição |
| --- | --- | --- |
| Gestor, mesas, estoque, impressão | Sim | PC ligado e aplicativo/servidor ativo |
| Cardápio e garçom na loja | Sim | Mesma LAN/Wi-Fi e porta do Windows permitida |
| Entregador na loja | Sim | Consegue chegar ao endereço do gestor |
| Registrar ação após perder sinal | Sim, pendente | Tela/lista carregada e armazenamento disponível; confirma quando reencontrar o servidor |
| Instalar PWA/GPS no celular | Exige HTTPS | IP da LAN por HTTP permite testar no navegador, mas não libera esses recursos |
| Usar pela internet/4G fora da loja | Ainda não publicado | Precisa de acesso HTTPS ao PC, por VPN/túnel configurado ou futura VPS |
| WhatsApp/IA/Precific/mapas | Dependem da internet | Mantêm as configurações externas já existentes |

Uma hospedagem estática separada não acessa automaticamente a API privada do PC, e um service worker não transforma o PC offline em servidor acessível pela internet. A operação externa e HTTPS continuam no próximo passo de infraestrutura.
