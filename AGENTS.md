<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- This project is exclusively NEROXA Master (internal platform panel); never reintroduce Pizza Perfect Plate MVP code (storefront, cart, checkout, pizzeria admin) or edit the original project from here.
- Master authorization uses the `is_neroxa_staff` RPC; preserve it as-is and make no database changes during structural cleanup.
