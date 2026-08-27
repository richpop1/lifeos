import { decrypt } from '@/lib/crypto';

interface ImapAccount {
  imapHost: string;
  imapPort: number;
  email: string;
  encryptedPassword: string;
}

interface DiscoveredFolders {
  trash: string | null;
  archive: string | null;
  spam: string | null;
  drafts: string | null;
}

async function getImapClient(account: ImapAccount, password?: string) {
  const { ImapFlow } = await import('imapflow');
  const pass = password || decrypt(account.encryptedPassword);
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    auth: { user: account.email, pass },
    logger: false,
  });
  await client.connect();
  return client;
}

/**
 * Discover standard folders (Trash, Archive, Spam, Drafts) by:
 * 1. IMAP special-use attributes (\Trash, \Archive, \Junk, \Drafts)
 * 2. Common folder name patterns for Gmail, Zoho, Outlook, etc.
 */
async function discoverFolders(client: any): Promise<DiscoveredFolders> {
  const result: DiscoveredFolders = { trash: null, archive: null, spam: null, drafts: null };

  try {
    const mailboxes = await client.list();

    // Known name patterns (lowercase) → folder type
    const trashNames = ['trash', 'bin', 'deleted items', 'deleted', 'deleted messages'];
    const archiveNames = ['archive', 'archives', 'all mail'];
    const spamNames = ['spam', 'junk', 'junk email', 'bulk mail'];
    const draftsNames = ['drafts', 'draft'];

    for (const mb of mailboxes) {
      const flags: string[] = (mb.flags || []).map((f: any) => String(f).toLowerCase());
      const specialUse = mb.specialUse ? String(mb.specialUse).toLowerCase() : '';
      const path: string = mb.path || '';
      const nameLower = (mb.name || path.split(mb.delimiter || '/').pop() || '').toLowerCase();
      const pathLower = path.toLowerCase();

      // Check special-use attributes first (most reliable)
      if (!result.trash && (flags.includes('\\trash') || specialUse === '\\trash')) {
        result.trash = path;
      }
      if (!result.archive && (flags.includes('\\archive') || specialUse === '\\archive' || flags.includes('\\all') || specialUse === '\\all')) {
        result.archive = path;
      }
      if (!result.spam && (flags.includes('\\junk') || specialUse === '\\junk')) {
        result.spam = path;
      }
      if (!result.drafts && (flags.includes('\\drafts') || specialUse === '\\drafts')) {
        result.drafts = path;
      }

      // Fallback: match by folder name patterns
      if (!result.trash && (trashNames.includes(nameLower) || trashNames.some(n => pathLower.endsWith('/' + n) || pathLower === n))) {
        result.trash = path;
      }
      if (!result.archive && (archiveNames.includes(nameLower) || archiveNames.some(n => pathLower.endsWith('/' + n) || pathLower === n))) {
        result.archive = path;
      }
      if (!result.spam && (spamNames.includes(nameLower) || spamNames.some(n => pathLower.endsWith('/' + n) || pathLower === n))) {
        result.spam = path;
      }
      if (!result.drafts && (draftsNames.includes(nameLower) || draftsNames.some(n => pathLower.endsWith('/' + n) || pathLower === n))) {
        result.drafts = path;
      }
    }

    console.log(`[IMAP] Discovered folders for ${client?.options?.auth?.user || 'unknown'}:`, JSON.stringify(result));
  } catch (err: any) {
    console.error('[IMAP] Folder discovery failed:', err?.message);
  }

  return result;
}

/** Move email to Trash on IMAP — uses folder discovery */
export async function imapMoveToTrash(account: ImapAccount, messageId: string, folder: string = 'INBOX', password?: string): Promise<boolean> {
  try {
    const client = await getImapClient(account, password);
    const folders = await discoverFolders(client);
    const lock = await client.getMailboxLock(folder);
    try {
      const uids: any = await client.search({ header: { 'message-id': messageId } });
      if (uids && uids.length > 0) {
        let moved = false;
        if (folders.trash) {
          try {
            await client.messageMove(uids, folders.trash, { uid: true });
            moved = true;
            console.log(`[IMAP] Moved ${messageId} to ${folders.trash}`);
          } catch (e: any) {
            console.error(`[IMAP] Move to discovered trash ${folders.trash} failed:`, e?.message);
          }
        }
        if (!moved) {
          await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
          console.log(`[IMAP] Flagged ${messageId} as \\Deleted (no trash folder found)`);
        }
      } else {
        console.log(`[IMAP] No UIDs found for ${messageId} in ${folder}`);
      }
    } finally { lock.release(); }
    await client.logout();
    return true;
  } catch (err: any) {
    console.error('[IMAP TRASH] Failed:', err?.message);
    return false;
  }
}

/** Move email to Spam/Junk folder on IMAP */
export async function imapMoveToSpam(account: ImapAccount, messageId: string, folder: string = 'INBOX', password?: string): Promise<boolean> {
  try {
    const client = await getImapClient(account, password);
    const folders = await discoverFolders(client);
    const lock = await client.getMailboxLock(folder);
    try {
      const uids: any = await client.search({ header: { 'message-id': messageId } });
      if (uids && uids.length > 0) {
        let moved = false;
        if (folders.spam) {
          try {
            await client.messageMove(uids, folders.spam, { uid: true });
            moved = true;
            console.log(`[IMAP] Moved ${messageId} to spam: ${folders.spam}`);
          } catch (e: any) {
            console.error(`[IMAP] Move to spam ${folders.spam} failed:`, e?.message);
          }
        }
        // If no spam folder, fall back to trash
        if (!moved && folders.trash) {
          try {
            await client.messageMove(uids, folders.trash, { uid: true });
            moved = true;
            console.log(`[IMAP] No spam folder, moved ${messageId} to trash: ${folders.trash}`);
          } catch (e: any) {
            console.error(`[IMAP] Spam fallback to trash failed:`, e?.message);
          }
        }
        if (!moved) {
          await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
          console.log(`[IMAP] No spam/trash folder, flagged ${messageId} as \\Deleted`);
        }
      } else {
        console.log(`[IMAP] No UIDs found for ${messageId} in ${folder}`);
      }
    } finally { lock.release(); }
    await client.logout();
    return true;
  } catch (err: any) {
    console.error('[IMAP SPAM] Failed:', err?.message);
    return false;
  }
}

/** Move email to Archive folder on IMAP — uses folder discovery */
export async function imapArchive(account: ImapAccount, messageId: string, folder: string = 'INBOX', password?: string): Promise<boolean> {
  try {
    const client = await getImapClient(account, password);
    const folders = await discoverFolders(client);
    const lock = await client.getMailboxLock(folder);
    try {
      const uids: any = await client.search({ header: { 'message-id': messageId } });
      if (uids && uids.length > 0) {
        let moved = false;
        if (folders.archive) {
          try {
            await client.messageMove(uids, folders.archive, { uid: true });
            moved = true;
            console.log(`[IMAP] Archived ${messageId} to ${folders.archive}`);
          } catch (e: any) {
            console.error(`[IMAP] Move to archive ${folders.archive} failed:`, e?.message);
          }
        }
        if (!moved) {
          // No archive folder (common on Zoho): mark as read to clear from unread
          // and move out of INBOX if possible by expunging
          await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
          console.log(`[IMAP] No archive folder for ${messageId}, marked as \\Seen`);
        }
      } else {
        console.log(`[IMAP] No UIDs found for ${messageId} in ${folder}`);
      }
    } finally { lock.release(); }
    await client.logout();
    return true;
  } catch (err: any) {
    console.error('[IMAP ARCHIVE] Failed:', err?.message);
    return false;
  }
}

/** Set or remove \Seen flag on IMAP */
export async function imapSetRead(account: ImapAccount, messageId: string, isRead: boolean, folder: string = 'INBOX', password?: string): Promise<boolean> {
  try {
    const client = await getImapClient(account, password);
    const lock = await client.getMailboxLock(folder);
    try {
      const uids: any = await client.search({ header: { 'message-id': messageId } });
      if (uids && uids.length > 0) {
        if (isRead) {
          await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
        } else {
          await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
        }
        console.log(`[IMAP] ${isRead ? 'Read' : 'Unread'}: ${messageId}`);
      }
    } finally { lock.release(); }
    await client.logout();
    return true;
  } catch (err: any) {
    console.error('[IMAP READ] Failed:', err?.message);
    return false;
  }
}

/** Set or remove \Flagged (star) on IMAP */
export async function imapSetStar(account: ImapAccount, messageId: string, isStarred: boolean, folder: string = 'INBOX', password?: string): Promise<boolean> {
  try {
    const client = await getImapClient(account, password);
    const lock = await client.getMailboxLock(folder);
    try {
      const uids: any = await client.search({ header: { 'message-id': messageId } });
      if (uids && uids.length > 0) {
        if (isStarred) {
          await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true });
        } else {
          await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true });
        }
        console.log(`[IMAP] ${isStarred ? 'Starred' : 'Unstarred'}: ${messageId}`);
      }
    } finally { lock.release(); }
    await client.logout();
    return true;
  } catch (err: any) {
    console.error('[IMAP STAR] Failed:', err?.message);
    return false;
  }
}

/** Batch IMAP operations — groups by account, one connection per account, discovers folders once */
export async function imapBatchOperation(
  emails: Array<{ messageId: string; folder: string; account: ImapAccount }>,
  operation: 'delete' | 'archive' | 'read' | 'unread' | 'star' | 'unstar' | 'spam'
): Promise<{ success: number; failed: number }> {
  // Group emails by account
  const byAccount = new Map<string, Array<{ messageId: string; folder: string; account: ImapAccount }>>();
  for (const em of emails) {
    const key = em.account.email;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(em);
  }

  let success = 0;
  let failed = 0;

  for (const [, accountEmails] of byAccount) {
    const account = accountEmails[0].account;
    let client: any;
    let folders: DiscoveredFolders = { trash: null, archive: null, spam: null, drafts: null };
    try {
      client = await getImapClient(account);
      folders = await discoverFolders(client);
    } catch (err: any) {
      console.error(`[IMAP BATCH] Connect failed for ${account.email}:`, err?.message);
      failed += accountEmails.length;
      continue;
    }

    // Group by folder within this account
    const byFolder = new Map<string, string[]>();
    for (const em of accountEmails) {
      const f = em.folder || 'INBOX';
      if (!byFolder.has(f)) byFolder.set(f, []);
      byFolder.get(f)!.push(em.messageId);
    }

    for (const [folder, messageIds] of byFolder) {
      let lock: any;
      try {
        lock = await client.getMailboxLock(folder);
        for (const msgId of messageIds) {
          try {
            const uids: any = await client.search({ header: { 'message-id': msgId } });
            if (!uids || uids.length === 0) { failed++; continue; }

            switch (operation) {
              case 'delete': {
                let moved = false;
                if (folders.trash) {
                  try { await client.messageMove(uids, folders.trash, { uid: true }); moved = true; } catch {}
                }
                if (!moved) await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
                break;
              }
              case 'archive': {
                let moved = false;
                if (folders.archive) {
                  try { await client.messageMove(uids, folders.archive, { uid: true }); moved = true; } catch {}
                }
                if (!moved) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
                break;
              }
              case 'spam': {
                let moved = false;
                if (folders.spam) {
                  try { await client.messageMove(uids, folders.spam, { uid: true }); moved = true; } catch {}
                }
                if (!moved && folders.trash) {
                  try { await client.messageMove(uids, folders.trash, { uid: true }); moved = true; } catch {}
                }
                if (!moved) await client.messageFlagsAdd(uids, ['\\Deleted'], { uid: true });
                break;
              }
              case 'read':
                await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
                break;
              case 'unread':
                await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
                break;
              case 'star':
                await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true });
                break;
              case 'unstar':
                await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true });
                break;
            }
            success++;
          } catch (err: any) {
            console.error(`[IMAP BATCH] ${operation} failed for ${msgId}:`, err?.message);
            failed++;
          }
        }
      } catch (err: any) {
        console.error(`[IMAP BATCH] Lock ${folder} failed:`, err?.message);
        failed += messageIds.length;
      } finally {
        if (lock) try { lock.release(); } catch {}
      }
    }

    try { await client.logout(); } catch {}
  }

  return { success, failed };
}
