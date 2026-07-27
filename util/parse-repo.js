/*
    Validates + normalises the "repository to clone" field from the VM create modal.

    Accepts (all GitHub, case-insensitive host/scheme):
        OWNER/REPO                                   shorthand
        github.com/OWNER/REPO                        scheme-less
        https://github.com/OWNER/REPO                full URL
        https://github.com/OWNER/REPO.git            clone URL
        https://github.com/OWNER/REPO/tree/main …    browser URL (extra path/query ignored)

    Returns { repo } normalised to a canonical `https://github.com/OWNER/REPO.git` so the
    codespaces image can `git clone` it verbatim, or { error } for the modal to show
    inline. An empty value is allowed (repo is optional) and returns { repo: null }.

    Deliberately rejected: SSH (`git@github.com:…`), tokenised URLs
    (`https://TOKEN@github.com/…` — would leak a secret into the VM tag), and non-github
    hosts (GHES, GitLab, www.github.com).
*/

// GitHub owner: alphanumeric + hyphen, max 39. Repo: alphanumeric, dot, underscore,
// hyphen, max 100. (We don't enforce GitHub's finer rules like no consecutive hyphens.)
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

export default function parseRepo(input) {
    let raw = (input || '').trim();
    if (!raw) return { repo: null };

    // Drop an optional http(s) scheme so scheme-less and full URLs share one path, then
    // drop any query string / fragment from a pasted browser URL.
    raw = raw.replace(/^https?:\/\//i, '').split(/[?#]/)[0];

    let owner, name;
    // github.com/OWNER/REPO[/extra…] — owner/repo are the first two path segments; any
    // trailing path (/tree/main, /pull/1, …) is ignored.
    const host = raw.match(/^github\.com\/([^/\s]+)\/([^/\s]+)/i);
    // OWNER/REPO — bare shorthand, no host.
    const short = raw.match(/^([^/\s]+)\/([^/\s]+?)\/?$/);

    if (host) {
        [, owner, name] = host;
    } else if (short) {
        [, owner, name] = short;
    } else {
        return { error: 'Invalid repo. Use owner/repo or a https://github.com/owner/repo URL.' };
    }

    name = name.replace(/\.git$/i, ''); // strip trailing .git from the repo name

    if (!OWNER_RE.test(owner) || !REPO_RE.test(name)) {
        return { error: 'Invalid repository owner or name.' };
    }

    return { repo: `https://github.com/${owner}/${name}.git` };
}
