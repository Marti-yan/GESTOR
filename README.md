# Pronto Gestor — MVP 0.1.1

Cardápio digital → pedido persistido → gestor → comanda térmica automática.

Este primeiro MVP foi preparado para **Elgin i8 USB, papel de 80 mm, usando o driver do Windows**. A impressão física depende da configuração do equipamento e deve ser validada pelo botão de teste. O aplicativo também aceita outras impressoras instaladas no Windows e papel de 58 mm.

## Começar pelo instalador Windows

A versão **0.1.1** corrige a falha de abertura `Cannot find module '../shared/receipt.cjs'` e o carregamento da tela inicial quando o caminho de instalação contém um diretório oculto. O módulo de comanda passa a ser carregado de `resources/shared` no aplicativo instalado. Uma verificação automática agora carrega as dependências do processo principal a partir do pacote final antes de gerar o instalador.

Baixe o **[pacote Windows em ZIP](https://github.com/Marti-yan/GESTOR/archive/refs/heads/downloads/windows-mvp-0.1.1.zip)**, escolha **Extrair tudo** e abra **Instalar.cmd**. O script monta o `.exe`, confere o SHA-256 e abre a instalação. O pacote está em uma branch de distribuição separada porque o instalador excede o limite de arquivo comum do Git. Quando a publicação por **[Releases](https://github.com/Marti-yan/GESTOR/releases)** estiver concluída, o `.exe` também poderá ser baixado diretamente em **Assets**.

É possível instalar em outro computador com Windows de 64 bits; o computador de desenvolvimento não precisa estar disponível. Cada instalação mantém seu próprio banco local. Para testar cardápio e pedidos sem a impressora, mantenha a impressão automática desligada e visualize a comanda no gestor.

1. Instale o driver Windows da Elgin i8. Confira que a impressora aparece em **Configurações → Impressoras e scanners** e imprima a página de teste do Windows.
2. Execute `Pronto-Gestor-0.1.1-Windows-x64.exe` e abra o Pronto Gestor.
3. Crie uma senha de pelo menos 12 caracteres. Em **Minha loja**, informe o nome, taxa de entrega e prazo; em **Cardápio**, edite os produtos de exemplo.
4. Em **Impressão**, selecione a Elgin i8 em **Comanda geral**, mantenha **80 mm**, salve e clique em **Testar**. Confira legibilidade, margem e avanço/corte do papel. O corte automático depende das preferências do driver.
5. Ligue **Impressão automática**.
6. Clique no ícone do celular no topo do gestor. Abra o QR Code no celular, na **mesma rede Wi-Fi/LAN** do computador.
7. Faça um pedido no cardápio. Ele deve aparecer em **Pedidos → Novos** e entrar na fila de impressão.

O instalador inclui Electron, Node.js e o servidor. **O restaurante não precisa instalar ferramentas de desenvolvimento, Node.js ou Docker.**

Recomendação inicial para operação: Windows 11 de 64 bits, 8 GB de RAM, SSD com pelo menos 2 GB livres para aplicativo/atualização e espaço adicional para dados. Essas são referências de dimensionamento do piloto, não resultados de benchmark em todos os equipamentos.

### Rede local

- O servidor usa a porta **4317**; se ocupada, tenta as próximas até 4330.
- O cardápio compartilhado usa o IP local do computador. O endereço `127.0.0.1` funciona somente no próprio computador.
- Se o Windows solicitar, permita acesso do servidor **somente em redes privadas**. O firewall precisa permitir a porta escolhida para que o celular alcance o cardápio.
- Celular e computador precisam estar na mesma rede, sem isolamento de clientes Wi-Fi. Evite a rede de visitantes do roteador.
- A internet não é necessária para esse fluxo na LAN depois de instalado. A conexão entre celular e computador é necessária.
- Fechar a janela mantém o aplicativo e a impressão ativos na bandeja do Windows. Para encerrar tudo, use **Encerrar Pronto e parar servidor** no ícone da bandeja.
- Computador desligado, suspenso ou aplicativo encerrado não recebe novos pedidos locais. Configure energia/ suspensão conforme a rotina da loja.
- IPs locais podem mudar. Um endereço reservado no roteador ajuda a preservar o link e o QR Code.

## Escopo entregue

- Cardápio responsivo, busca, categorias, carrinho e observações por item.
- Checkout para retirada ou entrega, endereço textual, telefone e pagamento na entrega/retirada.
- Preços e taxa recalculados no servidor; divergência de total impede envio silencioso.
- Identificador de idempotência para não duplicar um reenvio do mesmo pedido.
- Acompanhamento por link exclusivo, sem listagem pública de pedidos ou dados de outros clientes.
- Gestor com senha, pedidos em colunas e atualização periódica.
- Transições de preparo, pronto, finalizado e cancelado, com controle de concorrência.
- Edição de produtos, preço, disponibilidade, categoria e setor.
- Configuração de loja, pausa de recebimento, taxa fixa e prazo estimado.
- Impressão silenciosa pelo Electron, com seleção explícita da impressora do Windows.
- Comanda geral e saídas adicionais por setor, inclusive na mesma impressora física.
- Fila persistente no servidor e diário local de resultados de impressão.
- Falhas e resultados incertos visíveis, com reenvio confirmado pelo operador.
- Teste de impressão e visualização de comanda sem enviar ao equipamento.
- Servidor incluído no instalador e opção de conectar o gestor a servidor externo.

**Não há confirmação online de pagamento neste MVP.** Dinheiro e cartão são recebidos na entrega ou retirada. Não foram incluídos iFood, 99Food, WhatsApp, IA, entregadores, mapa, financeiro ou emissão fiscal.

O catálogo inicial é **exemplo editável**. Não existem pedidos falsos pré-cadastrados na instalação.

## Impressão: o que cada estado significa

| Estado | Significado |
|---|---|
| Na fila | Aguarda configuração ou disponibilidade do agente. |
| Reservada | Um agente reservou o trabalho; outro agente não pode reservá-lo junto. |
| Enviando | O envio físico foi iniciado. |
| Enviada à impressora | O subsistema de impressão aceitou o trabalho; não comprova que o papel saiu. |
| Falhou | Houve uma falha explícita. Confira equipamento/driver e reenvie. |
| Conferir impressão | O processo foi interrompido e o resultado físico não é conhecido. |

Após o envio físico, o resultado é salvo localmente antes da confirmação ao servidor. Uma falha somente nessa confirmação é recuperada sem repetir o efeito físico. Um reinício durante o envio exige conferência. A aplicação não promete impressão física exatamente uma vez.

Os trabalhos são criados no recebimento do pedido. Cancelar um pedido impede o envio das comandas ainda não iniciadas; não recolhe papel já impresso nem interrompe trabalho em andamento. Avise a cozinha nesses casos.

Configure **um computador principal** para a impressão automática neste MVP. A seleção de impressora corresponde ao nome instalado no Windows desse computador.

## Dados e backup

- Banco: SQLite em `%APPDATA%\Pronto Gestor\database\pronto.sqlite`.
- Diário de impressão e configuração: subpastas do mesmo diretório de dados do aplicativo.
- Tokens de acesso são armazenados com a proteção do Windows quando disponível.
- O banco e a configuração ficam fora da pasta de instalação, preservados em atualizações.
- Para um backup manual consistente, encerre o aplicativo **pela bandeja** e copie a pasta `database` completa. Não copie somente o `.sqlite` enquanto houver gravações, pois pode existir um arquivo WAL.
- Não compartilhe o banco: ele contém telefone e endereço dos clientes.

## Desenvolver e executar pelo código

Requisitos: Node.js 24 LTS, npm e um sistema com suporte a essas ferramentas.

```bash
npm ci
npm run dev
```

- Cardápio: `http://127.0.0.1:5173/#/`
- Gestor: `http://127.0.0.1:5173/#/gestor`
- API: `http://127.0.0.1:4317/api/health`
- Na primeira execução local, o gestor permite criar a senha.

Para executar a versão compilada:

```bash
npm run build
npm start
```

Para o Electron em desenvolvimento, compile a interface e abra o desktop; ele inicia **seu próprio banco/servidor** na pasta de dados do Electron:

```bash
npm run build
npm run desktop
```

Para gerar o instalador Windows:

```bash
npm run build:windows
```

O processo baixa o Node.js Windows da distribuição oficial, verifica o SHA-256, empacota a API e gera o instalador em `release/`. A compilação não utiliza um certificado de assinatura comercial; o Windows pode mostrar o aviso de editor desconhecido.

O workflow `.github/workflows/windows-release.yml` está configurado para fazer esse processo no GitHub Actions ao enviar uma tag `v*`: instala dependências, executa os testes, compila e publica uma **pré-versão** com instalador, código-fonte, guia e SHA-256. Use uma tag nova para cada publicação. A tag inicial foi enviada, mas o GitHub não iniciou nenhuma execução até a entrega; a configuração de Actions do repositório ainda precisa ser verificada para concluir esse caminho de publicação. O pacote ZIP acima permite testar o instalador existente sem depender desse processo. Bancos e configurações locais não entram na publicação.

## Testes

```bash
npm test
npm run build
npm run verify:package # depois do build Windows; confere módulos e recursos empacotados
```

Há testes para cálculo de preço, idempotência concorrente, autenticação, disponibilidade, estados, taxa/troco, reserva de impressão, expiração, cancelamento, proteção de origem, comanda setorizada e recuperação da fila local.

## Servidor externo e Hostinger

O fluxo local acima **não exige VPS**. Para que clientes fora da rede da loja façam pedidos, publique o servidor em infraestrutura com HTTPS e persistência de dados.

Esta versão usa **SQLite e uma instância de servidor**, não PostgreSQL/Redis. Um processo Node.js 24 com volume persistente é suficiente para o piloto. Em uma VPS Linux, uma configuração inicial pequena pode atender testes e uma loja; dimensione pelo uso real. Guarde o banco em um volume que sobreviva a atualizações.

Variáveis:

```dotenv
HOST=0.0.0.0
PORT=4317
DATA_DIR=/caminho/persistente/pronto
ADMIN_PASSWORD=defina-uma-senha-exclusiva-de-12-ou-mais-caracteres
COOKIE_SECURE=true
```

Defina `ADMIN_PASSWORD` antes de expor a primeira execução. O valor apenas cria a senha inicial se ainda não existir cadastro; não redefine a senha de um banco existente. Coloque HTTPS em um proxy reverso e mantenha a porta direta da API acessível apenas conforme a configuração da rede. O aplicativo aceita HTTP para endereços locais e exige HTTPS para servidores externos.

Para conectar o Windows, use **Minha loja → Conexão do aplicativo → Configurar**. Trocar o servidor exige novo login; o banco local não é automaticamente migrado.

**Hostinger Business:** o suporte a Node.js não garante que um arquivo SQLite local sobreviva aos fluxos de deploy. Antes de usar em produção nesse plano, implemente e valide um adaptador MySQL/serviço gerenciado ou confirme um volume persistente suportado. Não publique assumindo que a pasta de build seja armazenamento durável. O próximo comando para essa adaptação está em `PROXIMOS-COMANDOS.md`.

O PWA tem manifesto e cache dos arquivos estáticos, mas pedidos sempre dependem do servidor e não são enviados offline. Instalação e service worker em celulares geralmente precisam de HTTPS; o cardápio web funciona na LAN por HTTP.

## Estrutura

```text
src/                  Interface React/TypeScript
server/               API Express e SQLite
shared/receipt.cjs    Modelo HTML de comanda
desktop/              Electron, bridge e agente de impressão
scripts/              Desenvolvimento, build Windows e pacote fonte
tests/                Testes de API e impressão
dist/                 Interface compilada
release/              Instalador Windows gerado
```

Limites do MVP: uma loja, até 200 produtos, uma instância da API e até 250 pedidos exibidos no gestor. O banco preserva os demais pedidos, mas a interface ainda não possui paginação/relatórios completos. Ilustrações são representações visuais, substituíveis por fotos em uma próxima etapa. O alerta sonoro no navegador depende da permissão de reprodução após interação.

Veja os próximos passos em **[PROXIMOS-COMANDOS.md](PROXIMOS-COMANDOS.md)**.

Para aproveitar uma VPS que já roda outro sistema e a Hostinger Business, consulte **[INFRAESTRUTURA.md](INFRAESTRUTURA.md)**.
