# Testar o Pronto Gestor 0.4.0 na rede local

## Atualizar a instalação existente

Feche o gestor pela bandeja, baixe e execute o **[atualizador 0.4.0](https://github.com/Marti-yan/GESTOR/raw/refs/heads/downloads/windows-mvp-0.4.0/Reparar-Pronto-0.4.0.exe)**. Se houver uma janela de erro, feche-a também. Confira a pasta da instalação e conclua. O programa substitui aplicativo, servidor e interface e verifica os hashes. Seus pedidos, senha e configurações em `%APPDATA%\Pronto Gestor` são preservados. Ao abrir, confira **Pronto Gestor — 0.4.0** na barra de título.

Para instalar do zero, baixe o **[pacote Windows 0.4.0 em ZIP](https://github.com/Marti-yan/GESTOR/archive/refs/heads/downloads/windows-mvp-0.4.0.zip)**, escolha **Extrair tudo** e abra **Instalar.cmd**. Ele une as três partes, confere o SHA-256 e abre o instalador. O Node.js e o servidor já estão incluídos. Use Windows de 64 bits; não é necessário acessar o computador original.

Cada instalação mantém seus dados locais. Instalar em outro computador não sincroniza o banco do primeiro.

## Configurar a Elgin i8 e testar o aceite

1. Instale o driver da **Elgin i8 USB** e imprima a página de teste do Windows.
2. Abra o gestor e crie sua senha, caso seja uma instalação nova.
3. Em **Impressão**, selecione sua Elgin, papel **80 mm**, e expanda a saída geral.
4. Escolha **ESC/POS — Elgin i8**, avanço inicial zero e corte parcial. Salve as saídas.
5. Clique em **Testar este modelo**. Confira o aviso **2 COMANDAS**, mesa 12, senha A123, três lanches, bebidas, batata, observações, troco e **FIM DA COMANDA #123** antes do corte.
6. Após conferir o papel, ligue **Impressão automática**.
7. Abra o cardápio pelo ícone do celular no topo, usando outro celular no mesmo Wi-Fi. Faça um pedido: ele aparece em **Novos e ainda não imprime**.
8. Clique em **Aceitar e iniciar preparo**. O pedido avança e entra na fila. O botão não deve abrir o resumo. Os botões Pronto e Finalizar também avançam diretamente, sem gerar outra comanda.

Para testar sem impressora, mantenha a impressão automática desligada e use a visualização da comanda. Detalhes de modelos, guilhotina, duas cozinhas e diagnóstico em **[IMPRESSAO.md](IMPRESSAO.md)**.

## Categorias e produtos

Em **Cardápio**, crie ou renomeie as categorias e ajuste a ordem pelas setas. Use **Adicionar item** na categoria desejada e cadastre nome, preço e setor de impressão. O cardápio público mostra listas agrupadas por categoria nessa mesma ordem. Renomear categorias não altera a comanda de pedidos anteriores.

## Garçom no celular

1. No gestor, abra **Garçons**, habilite o acesso e defina um PIN de 6 a 12 números.
2. Abra o QR Code pelo celular no mesmo Wi-Fi. Entre com o nome do garçom e o PIN.
3. Escolha como visualizar as **categorias**, usando os botões de lista ou cards. Toque em uma categoria.
4. Escolha como visualizar os **itens** dessa categoria, também em lista ou cards. Essa escolha é independente da anterior: há quatro combinações, salvas no aparelho.
5. Adicione os itens, quantidades e observações. Informe mesa ou retirada, senha opcional, pagamento e troco quando houver.
6. Se quiser uma via extra, marque **Imprimir também no balcão**. Toque em **Aceitar e enviar à cozinha**. O pedido já entra em preparo e na fila do gestor. Em **Meus pedidos**, acompanhe os lançamentos do nome usado no login.

O PIN permite lançar pedidos, sem acesso às configurações administrativas. Alterar ou desativar o acesso no gestor encerra as sessões da equipe. O rascunho é salvo no aparelho; pedidos não são enviados offline.

**PWA no teste local:** por HTTP na LAN, abra no navegador. Instalar como aplicativo e usar o service worker no celular exige HTTPS, que será configurado na etapa de publicação. Não é necessária VPS para testar as funções acima.

## Lançamento no próprio gestor

Em **Pedidos → Novo pedido**, escolha categoria e produto pelo mesmo módulo. As preferências de categorias e itens são independentes das do garçom e ficam salvas nesse computador. O lançamento já entra aceito e na fila.

## Complementos, adicionais e destaques

Em **Cardápio → Complementos e adicionais**, crie grupos e opções, defina preços e limites e vincule os grupos em **Editar produto**. Eles aparecem ao escolher o item no cardápio, gestor e garçom. Em **Impressão**, escolha categorias e grupos para destacar com caixinha, negrito ou fundo preto. Os modelos geral, batata e balcão já estão cadastrados; confira os produtos selecionados na batata e as impressoras de cada saída.

## Próximas atualizações pelo aplicativo

Depois de instalar a 0.4.0, use **Minha loja → Atualizações do gestor → Buscar atualização**. Quando houver versão mais nova publicada, baixe e abra o instalador pelo próprio gestor. O arquivo é verificado antes de instalar. A operação permanece local, sem VPS. Consulte **ATUALIZACOES.md**.

## Rede e funcionamento

- O computador precisa ficar ligado e com o gestor ativo. Fechar a janela mantém o servidor na bandeja; use **Encerrar Pronto e parar servidor** para encerrá-lo.
- Celular e computador precisam estar na mesma rede, sem isolamento de clientes. Se o Windows solicitar, permita a porta do servidor na rede privada.
- Use o IP exibido no QR Code; `127.0.0.1` no celular aponta para o próprio celular.
- O teste local não depende de internet nem VPS. A conexão Wi-Fi/LAN entre os aparelhos é necessária.
- Antes de atualizar ou guardar um backup, encerre pela bandeja e copie a pasta de dados completa.

O executável foi gerado e os fluxos foram verificados em Linux com Electron. O instalador e a ponte nativa de impressão precisam ser conferidos em Windows real, junto com a Elgin física. O programa ainda não possui certificado de assinatura comercial.

Requisitos, código e backup em **README.md**; próximas etapas em **PROXIMOS-COMANDOS.md**.

## Relatórios, estoque e endereços

Em **Relatórios**, aplique filtros e exporte resumo, pedidos ou itens em CSV. Em **Estoque**, ajuste o saldo disponível de cada produto; pedidos reservam no envio e cancelamentos antes do preparo devolvem a reserva. Em **Endereços**, cadastre cidades e bairros para sugestões no checkout. CEP é opcional; ViaCEP ajuda a preencher. Gestor e garçom também podem lançar entregas. Regras e limitações em [RELATORIOS-ESTOQUE-ENDERECOS.md](RELATORIOS-ESTOQUE-ENDERECOS.md).
