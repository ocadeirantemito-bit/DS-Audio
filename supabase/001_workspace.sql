begin;

create table public.workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0
);
create table public.clients (
  owner_id uuid not null references public.workspaces on delete cascade,
  id uuid not null,
  name text not null check (length(trim(name)) > 0),
  phone text not null,
  primary key (owner_id, id)
);
create table public.staff (
  owner_id uuid not null references public.workspaces on delete cascade,
  id uuid not null,
  name text not null check (length(trim(name)) > 0),
  active boolean not null,
  primary key (owner_id, id)
);
create table public.orders (
  owner_id uuid not null references public.workspaces on delete cascade,
  id uuid not null,
  client_id uuid not null,
  number integer not null check (number > 0),
  description text not null check (length(trim(description)) > 0),
  created date not null,
  expected date,
  completed date,
  due date,
  status text not null check (status in ('Aguardando','Em produção','Finalizada','Entregue')),
  audit jsonb not null check (jsonb_typeof(audit) = 'array'),
  primary key (owner_id, id),
  unique (owner_id, number),
  foreign key (owner_id, client_id) references public.clients on delete cascade,
  check (status not in ('Finalizada','Entregue') or (completed is not null and completed >= created))
);
create table public.stages (
  owner_id uuid not null,
  order_id uuid not null,
  name text not null check (name in ('Caixaria','Pintura','Ferragem','Instalação')),
  staff_id uuid,
  charge bigint not null check (charge >= 0),
  labor bigint not null check (labor >= 0),
  primary key (owner_id, order_id, name),
  unique (owner_id, order_id, name, staff_id),
  foreign key (owner_id, order_id) references public.orders on delete cascade,
  foreign key (owner_id, staff_id) references public.staff,
  check (labor = 0 or staff_id is not null)
);
create table public.consumed_materials (
  owner_id uuid not null,
  order_id uuid not null,
  stage text not null,
  id uuid not null,
  name text not null check (length(trim(name)) > 0),
  qty numeric(16,3) not null check (qty > 0),
  unit text not null check (unit in ('folha','metro','litro','unidade','quilograma','outra')),
  cost bigint not null check (cost >= 0),
  paid_on date,
  position integer not null,
  primary key (owner_id, id),
  foreign key (owner_id, order_id, stage) references public.stages on delete cascade
);
create table public.sold_products (
  owner_id uuid not null,
  order_id uuid not null,
  id uuid not null,
  name text not null check (length(trim(name)) > 0),
  qty numeric(16,3) not null check (qty > 0),
  cost bigint not null check (cost >= 0),
  price bigint not null check (price >= 0),
  paid_on date,
  position integer not null,
  primary key (owner_id, order_id, id),
  foreign key (owner_id, order_id) references public.orders on delete cascade
);
create table public.customer_payments (
  owner_id uuid not null,
  order_id uuid not null,
  id uuid not null,
  date date not null,
  amount bigint not null check (amount > 0),
  method text not null check (method in ('Pix','Dinheiro','Cartão','Transferência')),
  note text not null,
  position integer not null,
  primary key (owner_id, id),
  foreign key (owner_id, order_id) references public.orders on delete cascade
);
create table public.payment_allocations (
  owner_id uuid not null,
  payment_id uuid not null,
  destination text not null check (destination in ('Caixaria','Pintura','Ferragem','Instalação','Material vendido','Entrada geral')),
  amount bigint not null check (amount > 0),
  primary key (owner_id, payment_id, destination),
  foreign key (owner_id, payment_id) references public.customer_payments on delete cascade
);
create table public.staff_payments (
  owner_id uuid not null,
  order_id uuid not null,
  stage text not null,
  staff_id uuid not null,
  id uuid not null,
  date date not null,
  amount bigint not null check (amount > 0),
  note text not null,
  position integer not null,
  primary key (owner_id, id),
  foreign key (owner_id, order_id, stage, staff_id) references public.stages (owner_id, order_id, name, staff_id) on delete cascade
);
create table public.expenses (
  owner_id uuid not null references public.workspaces on delete cascade,
  id uuid not null,
  description text not null check (length(trim(description)) > 0),
  category text not null,
  amount bigint not null check (amount > 0),
  date date not null,
  paid_on date,
  primary key (owner_id, id)
);
create table public.returns (
  owner_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  id uuid not null,
  qty numeric(16,3) not null check (qty > 0),
  date date not null,
  reason text not null,
  refund bigint not null check (refund >= 0),
  credit bigint not null check (credit >= 0),
  position integer not null,
  primary key (owner_id, id),
  foreign key (owner_id, order_id, product_id) references public.sold_products on delete cascade
);

do $$
declare tbl text;
begin
  foreach tbl in array array['workspaces','clients','staff','orders','stages','consumed_materials','sold_products','customer_payments','payment_allocations','staff_payments','expenses','returns'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from anon, authenticated', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = owner_id)', tbl);
  end loop;
end $$;

create function public.save_workspace(payload jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  v_revision bigint;
  record_item jsonb;
  order_item jsonb;
  stage_item record;
  stage_data jsonb;
  item record;
  order_key uuid;
begin
  if owner is null then raise exception 'Autenticação necessária'; end if;
  if jsonb_typeof(payload->'orders') is distinct from 'array'
    or jsonb_typeof(payload->'staff') is distinct from 'array'
    or jsonb_typeof(payload->'expenses') is distinct from 'array' then raise exception 'Dados inválidos'; end if;
  insert into public.workspaces(owner_id) values (owner) on conflict do nothing;
  select revision into v_revision from public.workspaces where owner_id = owner for update;
  if v_revision is distinct from expected_revision then raise exception 'Os dados mudaram. Recarregue a página antes de salvar.'; end if;

  delete from public.clients where owner_id = owner;
  delete from public.staff where owner_id = owner;
  delete from public.expenses where owner_id = owner;
  for record_item in select value from jsonb_array_elements(payload->'staff') loop
    insert into public.staff values (owner, (record_item->>'id')::uuid, record_item->>'name', (record_item->>'active')::boolean);
  end loop;
  for record_item in select value from jsonb_array_elements(payload->'expenses') loop
    insert into public.expenses values (owner, (record_item->>'id')::uuid, record_item->>'description', record_item->>'category',
      (record_item->>'amount')::bigint, (record_item->>'date')::date, nullif(record_item->>'paidOn','')::date);
  end loop;
  for order_item in select value from jsonb_array_elements(payload->'orders') loop
    order_key := (order_item->>'id')::uuid;
    insert into public.clients values (owner, order_key, order_item->>'customer', order_item->>'phone');
    insert into public.orders values (owner, order_key, order_key, (order_item->>'number')::integer, order_item->>'description',
      (order_item->>'created')::date, nullif(order_item->>'expected','')::date, nullif(order_item->>'completed','')::date,
      nullif(order_item->>'due','')::date, order_item->>'status', order_item->'audit');
    for stage_item in select key, value from jsonb_each(order_item->'stages') loop
      stage_data := stage_item.value;
      insert into public.stages values (owner, order_key, stage_item.key, nullif(stage_data->>'staffId','')::uuid, (stage_data->>'charge')::bigint, (stage_data->>'labor')::bigint);
      insert into public.consumed_materials
        select owner, order_key, stage_item.key, (value->>'id')::uuid, value->>'name', (value->>'qty')::numeric,
          value->>'unit', (value->>'cost')::bigint, nullif(value->>'paidOn','')::date, ordinality
        from jsonb_array_elements(stage_data->'materials') with ordinality;
      insert into public.staff_payments
        select owner, order_key, stage_item.key, (value->>'staffId')::uuid, (value->>'id')::uuid,
          (value->>'date')::date, (value->>'amount')::bigint, value->>'note', ordinality
        from jsonb_array_elements(stage_data->'payments') with ordinality;
    end loop;
    insert into public.sold_products
      select owner, order_key, (value->>'id')::uuid, value->>'name', (value->>'qty')::numeric,
        (value->>'cost')::bigint, (value->>'price')::bigint, nullif(value->>'paidOn','')::date, ordinality
      from jsonb_array_elements(order_item->'products') with ordinality;
    for item in select value, ordinality from jsonb_array_elements(order_item->'payments') with ordinality loop
      insert into public.customer_payments values (owner, order_key, (item.value->>'id')::uuid, (item.value->>'date')::date,
        (item.value->>'amount')::bigint, item.value->>'method', item.value->>'note', item.ordinality);
      insert into public.payment_allocations
        select owner, (item.value->>'id')::uuid, value->>'destination', (value->>'amount')::bigint
        from jsonb_array_elements(item.value->'allocations');
    end loop;
    insert into public.returns
      select owner, order_key, (value->>'productId')::uuid, (value->>'id')::uuid, (value->>'qty')::numeric,
        (value->>'date')::date, value->>'reason', (value->>'refund')::bigint, (value->>'credit')::bigint, ordinality
      from jsonb_array_elements(order_item->'returns') with ordinality;
  end loop;

  if exists (
    select 1 from public.orders o where o.owner_id = owner and
    (select count(*) from public.stages s where s.owner_id = owner and s.order_id = o.id) <> 4
  ) or exists (
    select 1 from public.customer_payments p where p.owner_id = owner and p.amount <>
      (select coalesce(sum(a.amount), 0) from public.payment_allocations a where a.owner_id = owner and a.payment_id = p.id)
  ) or exists (
    select 1 from public.stages s where s.owner_id = owner and s.labor <
      (select coalesce(sum(p.amount), 0) from public.staff_payments p where p.owner_id = owner and p.order_id = s.order_id and p.stage = s.name)
  ) or exists (
    select 1 from public.sold_products p where p.owner_id = owner and
      exists (
        select 1 from public.returns r
        where (r.owner_id, r.order_id, r.product_id) = (p.owner_id, p.order_id, p.id)
        group by r.product_id
        having sum(r.qty) > p.qty
          or sum(r.refund + r.credit) > round(p.qty * p.price) - round((p.qty - sum(r.qty)) * p.price)
          or bool_or(r.refund + r.credit > ceil(r.qty * p.price))
      )
  ) then raise exception 'Confira as etapas, valores distribuídos, mão de obra ou devoluções.'; end if;

  if exists (
    select 1 from public.orders o where o.owner_id = owner and
    (coalesce((select sum(c.amount) from public.customer_payments c where c.owner_id = owner and c.order_id = o.id), 0) <
      coalesce((select sum(r.refund + r.credit) from public.returns r where r.owner_id = owner and r.order_id = o.id), 0)
    or coalesce((select sum(c.amount) from public.customer_payments c where c.owner_id = owner and c.order_id = o.id), 0) >
    coalesce((select sum(s.charge) from public.stages s where s.owner_id = owner and s.order_id = o.id), 0)
    + coalesce((select sum(round(p.qty * p.price)) from public.sold_products p where p.owner_id = owner and p.order_id = o.id), 0))
  ) then raise exception 'O valor recebido excede o valor cobrado.'; end if;

  update public.workspaces set revision = v_revision + 1 where owner_id = owner;
  return v_revision + 1;
end $$;

create function public.load_workspace()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revision', coalesce((select revision from public.workspaces where owner_id = auth.uid()), 0), 'data', jsonb_build_object(
    'staff', coalesce((select jsonb_agg(to_jsonb(s) - 'owner_id' order by s.name) from public.staff s), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg((to_jsonb(e) - 'owner_id' - 'paid_on') || jsonb_build_object('paidOn', coalesce(e.paid_on::text,'')) order by e.date, e.id) from public.expenses e), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'number', o.number, 'customer', c.name, 'phone', c.phone, 'description', o.description,
      'created', o.created, 'expected', coalesce(o.expected::text,''), 'completed', coalesce(o.completed::text,''), 'due', coalesce(o.due::text,''),
      'status', o.status, 'audit', o.audit,
      'stages', (select jsonb_object_agg(s.name, jsonb_build_object(
        'staffId', coalesce(s.staff_id::text,''), 'charge', s.charge, 'labor', s.labor,
        'materials', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'qty', m.qty, 'unit', m.unit, 'cost', m.cost, 'paidOn', coalesce(m.paid_on::text,'')) order by m.position)
          from public.consumed_materials m where (m.owner_id, m.order_id, m.stage) = (s.owner_id, s.order_id, s.name)), '[]'::jsonb),
        'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'staffId', p.staff_id, 'date', p.date, 'amount', p.amount, 'note', p.note) order by p.position)
          from public.staff_payments p where (p.owner_id, p.order_id, p.stage) = (s.owner_id, s.order_id, s.name)), '[]'::jsonb)
      )) from public.stages s where (s.owner_id, s.order_id) = (o.owner_id, o.id)),
      'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'qty', p.qty, 'cost', p.cost, 'price', p.price, 'paidOn', coalesce(p.paid_on::text,'')) order by p.position)
        from public.sold_products p where (p.owner_id, p.order_id) = (o.owner_id, o.id)), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'amount', p.amount, 'method', p.method, 'note', p.note,
        'allocations', coalesce((select jsonb_agg(jsonb_build_object('destination', a.destination, 'amount', a.amount) order by a.destination)
        from public.payment_allocations a where (a.owner_id, a.payment_id) = (p.owner_id, p.id)), '[]'::jsonb)) order by p.position)
        from public.customer_payments p where (p.owner_id, p.order_id) = (o.owner_id, o.id)), '[]'::jsonb),
      'returns', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'productId', r.product_id, 'qty', r.qty, 'date', r.date, 'reason', r.reason, 'refund', r.refund, 'credit', r.credit) order by r.position)
        from public.returns r where (r.owner_id, r.order_id) = (o.owner_id, o.id)), '[]'::jsonb)
    ) order by o.number desc) from public.orders o join public.clients c on (c.owner_id, c.id) = (o.owner_id, o.client_id)), '[]'::jsonb)
  ));
$$;

revoke all on function public.save_workspace(jsonb, bigint) from public, anon;
revoke all on function public.load_workspace() from public, anon;
grant execute on function public.save_workspace(jsonb, bigint) to authenticated;
grant execute on function public.load_workspace() to authenticated;
commit;
