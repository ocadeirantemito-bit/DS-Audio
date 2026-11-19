# DS AUDIO GESTÃO

Sistema de gestão para encomendas de caixas de som, instalações e controle financeiro. A interface tem duas telas: **Encomendas e Produção** e **Resumo Financeiro**.

## Executar

Requer Node.js 22.12+ ou 24 LTS e npm.

```bash
npm ci
npm run dev
```

Abra o endereço mostrado pelo Vite no Chrome, Safari ou outro navegador moderno. Sem variáveis do Supabase, o ambiente usa dados fictícios identificados na interface. Alterações da demonstração ficam apenas no navegador atual. Para reiniciar a demonstração, remova a chave `ds-audio-demo-v1` no armazenamento local desse site.

```bash
npm test
npm run build
```

O build estático fica em `dist/`. As variáveis do Vite devem estar disponíveis na hora de gerar o build.

## Conectar ao Supabase

1. Crie um projeto no plano **Free** do Supabase. No **SQL Editor**, execute as migrações [001](supabase/001_workspace.sql), [002](supabase/002_retry_safe_writes.sql) e [003](supabase/003_owner_restore.sql), em ordem, uma vez cada. Num banco existente, faça um backup e execute somente as migrações pendentes.
2. Use um projeto exclusivo da empresa. Em **Authentication → Users**, crie e confirme a conta de e-mail e senha do proprietário. Nas configurações de autenticação, desative novos cadastros e login anônimo.
3. Ainda em **Authentication → Users**, copie o **User UID** da conta do proprietário. Autorize o backup executando a consulta abaixo no **SQL Editor**, com o UID real no lugar do exemplo. Saia e entre novamente se já houver uma sessão aberta.

   ```sql
   update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"ds_audio_owner": true}'::jsonb
    where id = 'COLE-O-USER-UID-AQUI'::uuid;
   ```

4. Copie `.env.example` para `.env.local`. Preencha `VITE_SUPABASE_URL` com a URL do projeto e `VITE_SUPABASE_PUBLISHABLE_KEY` com a chave publicável (ou chave legada `anon`). Guarde chaves secretas e `service_role` fora do front-end.
5. Reinicie o Vite ou publique um novo build. Entre com a conta do proprietário. O banco novo começa vazio. Os dados fictícios da demonstração ficam no navegador e não são enviados ao Supabase.

Cada proprietário acessa apenas seus próprios registros. As tabelas têm RLS e as alterações passam por uma RPC transacional, com controle de versão para impedir que duas sessões sobrescrevam silenciosamente o trabalho uma da outra. Se a conexão cair durante a gravação, mantenha o formulário aberto e tente novamente com os mesmos campos para confirmar a operação sem duplicá-la. Se outra sessão tiver gravado dados nesse intervalo, confira os registros e reaplique apenas as alterações pendentes. Preserve o que digitou antes de recarregar.

## Publicar no Firebase Hosting

1. No [console do Firebase](https://console.firebase.google.com/), crie um projeto no plano **Spark**. Escolha um ID disponível. A interface usa o Firebase Hosting tradicional. Login e dados continuam no Supabase.
2. Com o Supabase configurado em `.env.local`, rode os comandos abaixo na pasta do projeto. Substitua `ID-DO-PROJETO` pelo ID do Firebase. A CLI pede login na conta Google com acesso ao projeto.

   ```bash
   npm ci
   npm run build
   npx firebase-tools login
   npx firebase-tools deploy --only hosting --project ID-DO-PROJETO
   ```

3. A publicação gera o build de produção em `dist/` e exige a URL e a chave publicável do Supabase. Abra `https://ID-DO-PROJETO.web.app` pelo celular ou computador, entre como proprietário e siga a validação abaixo.

O endereço padrão já tem HTTPS e dispensa domínio próprio. Consulte antes as franquias de armazenamento e transferência do [Firebase Hosting](https://firebase.google.com/docs/hosting/usage-quotas-pricing) e os limites do [plano Free do Supabase](https://supabase.com/pricing). Restauração gerenciada, retenção maior e uso acima das franquias podem exigir plano pago. O aplicativo funciona direto no navegador.

## Uso diário

- Escolha ou crie uma encomenda. Abra cada etapa para lançar mão de obra e materiais. Nomes e custos de materiais de encomendas anteriores aparecem como sugestões.
- Use **Salvar caixa** para gravar edições da encomenda. Ao confirmar um recebimento, adiantamento ou devolução, o lançamento e a encomenda são gravados juntos. A confirmação aparece depois que o banco responde. O sistema vincula cada etapa e seus pagamentos ao funcionário escolhido.
- Registre a data de pagamento das compras quando quiser que apareçam como saída de caixa. Informe a data de conclusão para reconhecer a encomenda no resultado gerencial. Reembolsos saem do caixa na data da devolução. Créditos concedidos ficam no histórico da devolução para controle do proprietário.
- Use **Imprimir / PDF** para imprimir o resumo interno da encomenda, que inclui custos e lucro.

## Exportação, backup e recuperação

- **Backup → Baixar backup JSON** baixa os dados gravados no Supabase, com versão, data e verificação de integridade. O arquivo não inclui credenciais ou sessão. Guarde-o em local protegido porque contém dados da empresa e dos clientes.
- **Backup → Restaurar backup** valida o arquivo e mostra um resumo. Baixe primeiro um backup atual, confira o arquivo escolhido e só então confirme. A operação substitui todos os registros da conta em uma transação. Para restaurar em um projeto novo, aplique as migrações, autorize o proprietário nesse projeto e importe o JSON na conta selecionada.
- O backup manual complementa o backup de banco descrito abaixo. A opção JSON aceita arquivos de até 20 MB e exige a conta autorizada do proprietário.

**Exportar dados em CSV** salva os registros gravados da conta atual em UTF-8. Cada linha tem um tipo e uma coluna com o registro completo. Para evitar dupla contagem, filtre por tipo antes de somar valores no arquivo. O CSV serve para consulta e conferência e contém dados pessoais e financeiros.

1. No Supabase, abra **Database → Backups** e confirme a frequência, retenção e opções de restauração do plano. Antes de atualizar o banco, anote o último ponto recuperável. Se o plano não oferecer backups automáticos, siga o procedimento oficial de [backup e restauração com Supabase CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) e proteja os arquivos e as credenciais de banco.
2. Ensaie a restauração em outro projeto. Use **Restore to a new project**, quando disponível, ou o procedimento de restauração da CLI. Preserve os usuários do esquema `auth` com seus IDs originais. Recriar o mesmo e-mail em um projeto vazio gera outro ID e não dá acesso aos registros restaurados.
3. Em uma cópia do aplicativo, use a URL e a chave publicável do projeto restaurado. Entre como proprietário e confira uma encomenda e seu histórico, funcionários, despesas e totais no financeiro. Confirme o acesso antes de mudar o endereço do aplicativo em uso.
4. Numa recuperação real, suspenda as gravações, selecione o ponto de restauração, valide a cópia e só então atualize a configuração do aplicativo. Registros gravados após o ponto escolhido podem precisar ser relançados.

## Validação antes de usar dados reais

1. Em um projeto de teste conectado, entre com o proprietário. Crie uma encomenda fictícia com funcionário e material. Registre pagamento parcial, devolução e despesa. No financeiro, confira os valores.
2. Recarregue a página, saia e entre novamente. Em outro navegador ou janela anônima, confirme que a tela pede login e que os mesmos dados aparecem depois de entrar. Se usar uma segunda conta de teste, ela deve ver apenas o próprio espaço.
3. Interrompa a conexão antes de salvar um lançamento fictício. Confira o aviso e os campos preservados. Reconecte, repita com os mesmos campos e confira que o lançamento aparece uma única vez.
4. Em um projeto de teste, exporte um JSON, altere uma encomenda fictícia e restaure o JSON. Confirme que os registros retornaram ao estado anterior. Execute também o ensaio de restauração do banco se ele estiver disponível no seu plano. Use dados reais após validar a gravação hospedada, o login e a recuperação.

`npm test` testa o esquema, as políticas RLS e o salvamento em um PostgreSQL local (PGlite). O teste com um projeto Supabase hospedado é separado e requer a configuração descrita acima.
