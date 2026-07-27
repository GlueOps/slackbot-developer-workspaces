/*
    Validates + normalises the "repository to clone" field from the VM create modal.

    Accepts exactly these forms (all GitHub):
        https://github.com/OWNER/REPO.git
        https://github.com/OWNER/REPO
        OWNER/REPO

    Returns { repo } normalised to a canonical `https://github.com/OWNER/REPO.git` URL so
    the codespaces image can `git clone` it verbatim, or { error } for the modal to show
    inline. An empty value is allowed (repo is optional) and returns { repo: null }.
*/

// GitHub owner: alphanumeric + hyphen, max 39. Repo: alphanumeric, dot, underscore,
// hyphen, max 100. (We don't enforce GitHub's finer rules like no consecutive hyphens.)
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

export default function parseRepo(input) {
    const raw = (input || '').trim();
    if (!raw) return { repo: null };

    let owner, name;
    const url = raw.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
    const short = raw.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
    if (url) {
        [, owner, name] = url;
    } else if (short) {
        [, owner, name] = short;
    } else {
        return { error: 'Invalid repo. Use owner/repo or https://github.com/owner/repo(.git).' };
    }

    if (!OWNER_RE.test(owner) || !REPO_RE.test(name)) {
        return { error: 'Invalid repository owner or name.' };
    }

    return { repo: `https://github.com/${owner}/${name}.git` };
}
