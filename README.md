# Pronto Gestor 0.1.2 — teste local Windows

## Já instalou e o gestor continua com erro?

1. Feche o Pronto, inclusive a janela de erro e a bandeja.
2. [Baixe Reparar-Pronto-0.1.2.exe](https://github.com/Marti-yan/GESTOR/raw/refs/heads/downloads/windows-mvp-0.1.2/Reparar-Pronto-0.1.2.exe) e execute.
3. Confira a pasta da instalação existente, conclua e abra o programa pelo reparador. A barra de título deve mostrar **Pronto Gestor — 0.1.2**.

O reparador tem aproximadamente 1,8 MB, substitui os arquivos do programa e confere seus hashes. Ele preserva pedidos, senha e configurações em `%APPDATA%\Pronto Gestor`. Se o programa ainda estiver em execução, feche-o; se não encontrar a janela/processo, reinicie o Windows antes de reparar.

O novo desktop inclui a comanda no próprio processo principal, sem depender de `shared/receipt.cjs` externo. Falhas de substituição ou de integridade interrompem o reparo.

## Instalação nova

[Baixe o ZIP completo](https://github.com/Marti-yan/GESTOR/archive/refs/heads/downloads/windows-mvp-0.1.2.zip), escolha **Extrair tudo** e abra **Instalar.cmd**. O script monta o instalador a partir das três partes, confere o SHA-256 e abre a instalação. Windows de 64 bits; servidor e Node.js incluídos. O computador original não precisa estar disponível.

## Testar

Abra o cardápio pelo botão do celular no gestor, use a mesma rede Wi-Fi e envie um pedido. Confira sua chegada em **Pedidos → Novos**. Para imprimir, instale o driver da Elgin i8 USB, selecione a impressora e papel de 80 mm em **Impressão**, salve e envie a comanda de teste antes de ligar a impressão automática.

O teste permanece local. Consulte [COMECAR-AQUI.md](COMECAR-AQUI.md). Os hashes dos executáveis estão em [SHA256SUMS.txt](SHA256SUMS.txt).

## Validação

12 testes automatizados, build e conteúdo dos executáveis verificados. O pacote foi exercitado com Electron/Node Linux sem o arquivo externo de comanda: abertura, pedido anterior preservado, novo pedido e visualização de comanda passaram. O instalador/reparador ainda não foi executado em Windows real neste ambiente e a saída física na Elgin precisa de validação.

Código e documentação: [MVP no GitHub](https://github.com/Marti-yan/GESTOR/tree/codex/mvp-pronto-gestor).
