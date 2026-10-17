# Atualização pelo próprio gestor

A partir da **0.3.0**, abra **Minha loja → Atualizações do gestor → Buscar atualização**. Quando houver versão nova, use **Baixar atualização** e aguarde a verificação. Depois, use **Fechar gestor e abrir instalador**.

A versão 0.2.0 não possuía esse botão. Para chegar à 0.3.0, feche o gestor pela bandeja e execute o atualizador pequeno disponibilizado na distribuição. As próximas versões poderão ser consultadas pelo aplicativo.

A atualização exige internet somente para consultar e baixar. Pedidos e impressão continuam locais; não é necessária VPS. O instalador preserva dados em APPDATA. Ele abre um assistente normal do Windows; conclua a instalação e confira a versão na barra de título. A impressão automática fica pausada ao instalar: confira a fila e reative após abrir.

## Canal de publicação

O aplicativo lê `updates/windows.json` da branch **main** em `Marti-yan/GESTOR`. Tenta **master** somente quando o arquivo na main responde 404. Ele baixa um executável compilado; não executa `git pull` nem recompila código no computador da loja.

O manifesto contém versão, versão mínima, tamanho, SHA-256, notas e endereço de um atualizador em commit imutável da branch de distribuição. Apenas HTTPS e o caminho do repositório oficial são aceitos. O arquivo é verificado após baixar e novamente antes de abrir; um download incompleto ou alterado não é instalado. Versão igual ou mais antiga não é oferecida.

Este é um piloto sem certificado comercial de assinatura. O SHA-256 confere a correspondência com o manifesto publicado; a segurança do canal também depende da conta e permissões do repositório. As atualizações não são instaladas automaticamente.

## Publicar uma próxima versão

1. Incremente `package.json` e lockfile; conclua código, testes e conferência da interface.
2. Execute `npm run build:windows` e confira o conteúdo do pacote.
3. Publique instaladores, código-fonte e hashes na branch de distribuição da versão, sem banco ou credenciais. Guarde o commit dessa publicação.
4. Gere o manifesto usando o executável exato que foi publicado:

```bash
node scripts/create-update-manifest.mjs COMMIT_DOS_DOWNLOADS /caminho/da/main/updates/windows.json
```

5. Confira URL, versão e SHA-256, publique somente depois de verificar o download público e envie o manifesto à main/master.
6. Teste “Buscar atualização” e o download usando uma versão anterior do cliente, sem instalar em uma loja durante atendimento.

O atualizador pequeno substitui aplicativo, API e interface. Use-o enquanto o runtime incluído continuar compatível; mudanças de Electron/Node ou de requisitos de instalação precisam de instalador completo e revisão da versão mínima. Não troque o arquivo de uma versão já publicada: use outra versão/commit.

## Versão 0.6.0

Atendimento por tickets, tags/Kanban, contatos, respostas rápidas e campanhas com consentimento. Adaptadores de texto Evolution/Cloud API precisam de serviço/conta externa e homologação. Agente OpenAI por API com RAG local/FTS5, cadastro da loja e fine-tuning opcional a partir de exemplos revisados. PWA do entregador, atribuições, localização confirmada do cliente e GPS compartilhado em mapa, com indicação de precisão/posição antiga e opção de parar. O GPS no celular exige HTTPS.

As tabelas novas são acrescentadas ao banco existente. Inclua `database/provider.key` no backup junto do banco se cadastrar credenciais. Nenhuma chamada paga nem mensagem real foi executada na entrega. A conexão do Atende Chat aguarda acesso à sua documentação/código. Guias: WHATSAPP-IA-ENTREGADORES.md e LEVANTAMENTO-ATENDECHAT.md.

## Versão 0.7.0

Aba Precific com site original e sessão persistente; atualizações do site por recarga, sem novo instalador. Adaptador Atende Chat por HTTP/Socket.IO, tickets, QR, texto e pausa/retomada do agente do gestor. Filas são vinculadas à conexão. Guia: INTEGRACAO-ATENDECHAT-PRECIFIC.md. Nenhuma VPS/Hostinger foi alterada.


## Versão 0.8.0

Mesas e contas, balão ao adicionar no garçom, combos com reserva de acompanhantes e impressão por cozinha, entregador com fila idempotente/filtros/rotas, SSR do cardápio público com divisão de módulos e compressão, importação por planilha e backups verificados. Veja [OPERACAO-LOCAL-0.8.md](OPERACAO-LOCAL-0.8.md). O atualizador inclui o módulo `menu-ssr.cjs` e verifica seu hash. Preserva dados e integrações existentes; nenhuma infraestrutura externa foi alterada.
