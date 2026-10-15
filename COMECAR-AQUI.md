# Testar o Pronto Gestor

## Baixar em outro computador

**Já instalou e o gestor continua com erro?** Feche o programa, incluindo a janela de erro e a bandeja, e execute o **[reparador 0.1.2](https://github.com/Marti-yan/GESTOR/raw/refs/heads/downloads/windows-mvp-0.1.2/Reparar-Pronto-0.1.2.exe)**. Confira a pasta da instalação existente e conclua. Ele substitui os arquivos do programa, verifica os hashes e preserva seus dados em `%APPDATA%\Pronto Gestor`. Se detectar o programa ainda em execução, reinicie o Windows antes de reparar. A barra de título deve mostrar **0.1.2** ao abrir.

Para uma instalação nova, baixe o **[pacote Windows 0.1.2 em ZIP](https://github.com/Marti-yan/GESTOR/archive/refs/heads/downloads/windows-mvp-0.1.2.zip)**, escolha **Extrair tudo** e abra **Instalar.cmd** na pasta extraída. O script monta o instalador a partir das três partes, confere sua integridade e abre a instalação. Esse pacote disponibiliza o instalador já gerado enquanto a publicação por Releases não é concluída.

Quando houver uma versão em **[Releases no GitHub](https://github.com/Marti-yan/GESTOR/releases)**, também será possível baixar `Pronto-Gestor-0.1.2-Windows-x64.exe` diretamente na seção **Assets**.

A versão 0.1.2 inclui os módulos de comanda no processo principal e verifica a substituição dos arquivos na atualização. Para atualizar, instale na mesma pasta da versão anterior. O banco e as configurações em `%APPDATA%\Pronto Gestor` são preservados.

O instalador inclui o servidor e o Node.js. Você não precisa acessar o computador original ou instalar ferramentas de desenvolvimento. Use um computador com Windows de 64 bits.

Para testar **sem impressora**, instale, crie a senha e mantenha a impressão automática desligada. Abra o cardápio pelo botão do celular no topo do gestor, envie um pedido e confira em **Pedidos → Novos**. O celular precisa estar no mesmo Wi-Fi; você também pode abrir o link no navegador do próprio computador. É possível visualizar a comanda antes de ter a Elgin conectada.

Cada computador guarda seus próprios pedidos e configurações. A instalação em outro computador começa com dados novos e produtos de exemplo; não sincroniza com a instalação anterior.

## Primeiro pedido na Elgin i8

1. Instale o driver Windows da **Elgin i8 USB** e imprima a página de teste do Windows.
2. Execute o instalador **Pronto-Gestor-0.1.2-Windows-x64.exe** e abra o aplicativo.
3. Crie uma senha com pelo menos 12 caracteres.
4. Vá em **Minha loja** e edite os dados. Em **Cardápio**, adapte os produtos de exemplo.
5. Vá em **Impressão**, selecione sua Elgin na saída **Comanda geral**, mantenha **80 mm** e clique em **Salvar saídas**.
6. Clique em **Testar**. Confira fonte, margens e saída do papel.
7. Ligue **Impressão automática**.
8. Clique no ícone do **celular**, no topo. Abra o QR Code em um celular conectado ao mesmo Wi-Fi do computador.
9. Faça o pedido. Ele aparecerá em **Pedidos → Novos** e será enviado para a impressora.

Se o celular não abrir o cardápio, confira a rede privada e a permissão do servidor no firewall do Windows. O endereço não pode ser `127.0.0.1` no celular.

Mantenha o computador ligado. Fechar a janela deixa o aplicativo na bandeja; para encerrar o servidor, use a opção **Encerrar Pronto e parar servidor** na bandeja.

O primeiro uso funciona na **rede local**, sem VPS. Para clientes fora da loja, a publicação externa é uma próxima etapa. Pagamentos deste MVP são feitos na entrega ou retirada.

O instalador foi gerado, mas não foi executado em um Windows real neste ambiente. A Elgin física ainda precisa ser validada pelo teste acima. O aplicativo não possui certificado de assinatura comercial.

Consulte **README.md** para requisitos, código, backup e implantação, e **PROXIMOS-COMANDOS.md** para evoluir o projeto.
