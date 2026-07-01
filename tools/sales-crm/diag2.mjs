const GRAPHQL = process.env.TWENTY_GRAPHQL ?? 'http://127.0.0.1:3000/graphql';
const META = process.env.TWENTY_META ?? 'http://127.0.0.1:3000/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN;
const EMAIL = process.env.TWENTY_EMAIL, PASSWORD = process.env.TWENTY_PASSWORD;

function describe(e) {
  return { message: e.message, name: e.name, cause: e.cause ? { message: e.cause.message, code: e.cause.code } : undefined };
}
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`[OK ${Date.now() - t0}ms] ${name}`, r ? JSON.stringify(r).slice(0, 300) : '');
    return r;
  } catch (e) {
    console.log(`[FAIL ${Date.now() - t0}ms] ${name}:`, JSON.stringify(describe(e)));
    throw e;
  }
}
async function gqlOnce(endpoint, query, variables, token) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

let token;
await step('login: getLoginTokenFromCredentials (META)', async () => {
  const a = await gqlOnce(META, `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`, { e: EMAIL, p: PASSWORD, o: ORIGIN });
  var loginToken = a.getLoginTokenFromCredentials.loginToken.token;
  const b = await gqlOnce(META, `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`, { t: loginToken, o: ORIGIN });
  token = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
  return { gotToken: !!token };
});

await step('query workflows (GRAPHQL /graphql)', async () => {
  const d = await gqlOnce(GRAPHQL, `query($n:String!) { workflows(filter:{name:{eq:$n}}) { edges { node { id } } } }`, { n: 'Lead Round-Robin Assignment' }, token);
  return { count: d.workflows.edges.length };
});

await step('query objects (META /metadata, same as other successful scripts)', async () => {
  const d = await gqlOnce(META, `query { objects(paging:{first:5}) { edges { node { nameSingular } } } }`, {}, token);
  return { count: d.objects.edges.length };
});

console.log('\ndone.');
