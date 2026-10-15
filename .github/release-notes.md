MVP para testar **cardápio digital → recebimento no gestor → impressão térmica**. A versão 0.1.1 corrige a abertura do gestor no aplicativo empacotado: o módulo de comanda é carregado do diretório correto de recursos. O build agora verifica as dependências dentro do pacote antes de gerar o instalador.

### Como testar em outro computador

1. Em **Assets**, baixe `Pronto-Gestor-0.1.1-Windows-x64.exe` e instale em um computador com Windows de 64 bits. O servidor local e o Node.js já estão incluídos.
2. Abra o Pronto Gestor e crie sua senha, com pelo menos 12 caracteres.
3. Edite os produtos de exemplo em **Cardápio** e os dados em **Minha loja**.
4. Para testar sem impressora, mantenha a impressão automática desligada. Abra o cardápio pelo botão do celular no topo do gestor; use o QR Code no celular, conectado ao mesmo Wi-Fi, ou abra o endereço no próprio computador.
5. Faça um pedido e confira sua chegada em **Pedidos → Novos**. Você também pode visualizar a comanda e testar os estados do pedido.
6. Para imprimir, instale o driver da **Elgin i8 USB**, teste pelo Windows e depois selecione a impressora em **Impressão → Comanda geral**, com **80 mm**. Salve, clique em **Testar** e só então ative a impressão automática.

Consulte o arquivo `COMECAR-AQUI.md` para o passo a passo. Recomendação para o piloto: Windows 11 de 64 bits, 8 GB de RAM e SSD com 2 GB livres, além do espaço para os dados.

### Limites desta versão

- O cardápio funciona na rede local. O computador precisa ficar ligado com o aplicativo ativo. Não é necessário acessar o computador onde o programa foi desenvolvido nem contratar uma VPS para esse teste.
- Cada instalação usa seu próprio banco local. Os pedidos e configurações de um computador não aparecem automaticamente no outro.
- Os pagamentos são feitos na entrega ou retirada; não há cobrança online.
- O aplicativo ainda não tem certificado de assinatura comercial. A instalação em Windows real e a impressão física na Elgin precisam ser validadas pelo usuário; os testes automatizados não substituem essa validação.

O arquivo `SHA256SUMS.txt` permite conferir a integridade do instalador. O ZIP de código-fonte contém o projeto e a interface compilada, sem bancos de clientes ou credenciais.
