/**
 * 00713's door as a world answers it: post_approve_whole keeps the facts the owner stated, the piece's words and the
 * approval, or keeps nothing (the database does the three in one transaction). Made from the world's own stubs of the
 * doors it calls, so a test still reads what each was asked: the approval first (piece_posts_replace for a version,
 * post_approve otherwise), then, only once it is approved, owner_claims_keep for each fact and piece_words_keep for the
 * words. A world with no stub for a door it never needs leaves it out. The database in memory answers a door as it is
 * called, so each stub answers at once, as this does.
 */
export function approveWhole(doors) {
  return (args) => {
    const { p_tenant_id, p_file_id, p_approval } = args;
    const answer = (p_approval.replace ? doors.piece_posts_replace : doors.post_approve)(args);
    if (answer?.fate !== "approved") return answer;
    for (const claim of p_approval.claims ?? []) doors.owner_claims_keep?.({ p_tenant_id, p_claim: claim });
    if (p_approval.words) doors.piece_words_keep?.({ p_tenant_id, p_file_id, p_caption: p_approval.words });
    return answer;
  };
}
