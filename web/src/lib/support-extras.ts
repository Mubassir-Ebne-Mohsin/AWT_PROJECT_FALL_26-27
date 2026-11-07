/** Preserve the draft exactly; adding a reply never submits or silently truncates it. */
export function appendSavedReply(draft:string,reply:string):string {
  const next=draft ? draft+"\n\n"+reply : reply;
  if(next.trim().length>4000)throw new Error("This would exceed 4000 characters. Shorten your draft first.");
  return next;
}
