# vendor

Third-party code, copied here so the app never has to load anything from another website.

## supabase.min.js

- **What:** the Supabase JavaScript client, `@supabase/supabase-js` version **2.117.3** (the browser "UMD" build).
- **Why:** it lets a signed-in grown-up sync the family's progress between devices. It is only used when someone signs in; without a login it never sends anything.
- **Where it came from:** `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js`
  (jsDelivr adds a short comment at the top; the rest is the published file unchanged).
- **SHA-256:** `36d1ad9948fdbba9c3d696e27050f70aafce88981938b6a814a6ad8abdf171ba`
- **License:** MIT, copyright (c) 2020 Supabase. The full text is below.

To update it, download the same path with the new version number, check the app still signs in and syncs, and update the version and checksum here.

## License (from the package's LICENSE file)

```
MIT License

Copyright (c) 2020 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
