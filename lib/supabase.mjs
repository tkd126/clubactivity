// Publishable/secret keys are opaque API keys, not JWT bearer tokens.
export function supabaseHeaders(key,token) {
 return {apikey:key,...(token&&!(token===key&&key.startsWith('sb_'))?{Authorization:'Bearer '+token}:{})};
}
