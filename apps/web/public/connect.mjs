#!/usr/bin/env node
// === EMBEDDED_HOOKS_START ===
export const EMBEDDED_CLAUDE_HOOK = Buffer.from("IyEvdXNyL2Jpbi9lbnYgbm9kZQovLwovLyBDbGF1ZGUgQ29kZSBTdG9wL1Nlc3Npb25TdGFydCDtm4XsnLzroZwg7Iuk7KCcIOyXkOydtOyghO2KuCDsi6TtlonsnYQgTXVzdGVy7JeQIOuztOqzoO2VnOuLpC4KLy8KLy8g67Cw6rK9OiBBR0VOVF9SVU5T64qUIOyEpOqzhOyDgSDsmbjrtoAg7JeQ7J207KCE7Yq46rCAIFgtQVBJLUtleeuhnCDsp4HsoJEg7LGE7JuMIOuEo+uKlCDsnpDsp4Tsi6Dqs6AKLy8g7YWM7J2067iU7J24642wKOyEpOqzhOyEnCBQYXJ0IDQgwqc2KSwg7KeA6riI6rmM7KeAIOq3uCBBUEnrpbwg7Iuk7KCc66GcIO2YuOy2nO2VmOuKlCDtgbTrnbzsnbTslrjtirjqsIAg7JeG7Ja07IScCi8vICLthqDtgbAg7IKs7Jqp65+JIiDsubTrk5zqsIAg7ZWt7IOBIDDsnbTsl4jri6QuIOydtCDsiqTtgazrpr3tirjqsIAg6re4IO2BtOudvOydtOyWuO2KuCDspJEg7ZWY64KY64ukIOKAlAovLyBDbGF1ZGUgQ29kZSDshLjshZgg7Iuc7J6RL+yiheujjOyXkCDrp57strAg7Iuk7ZaJ7J2EIOyLnOyekcK37KKF66OMIOq4sOuhne2VnOuLpC4KLy8KLy8g7Iuk7Yyo7ZW064+EIENsYXVkZSBDb2RlIOyEuOyFmCDsnpDssrTrpbwg66eJ7Jy866m0IOyViCDrkJzri6QuIOq3uOuemOyEnCDrrLTsiqgg7J287J20IOyeiOyWtOuPhCDtla3sg4EKLy8gZXhpdCBjb2RlIDDsnLzroZwg64Gd64K06rOgLCDrrLjsoJzripQgc3RkZXJy7JeQ66eMIOuCqOq4tOuLpC4KLy8KLy8g7ISk7LmYOiBkb2NzL0FHRU5UX1RPS0VOX1JFUE9SVElORy5tZCDssLjsobAuCgppbXBvcnQgeyBleGVjRmlsZVN5bmMgfSBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnOwppbXBvcnQgeyByZWFkRmlsZVN5bmMsIGV4aXN0c1N5bmMsIG1rZGlyU3luYywgd3JpdGVGaWxlU3luYywgcm1TeW5jIH0gZnJvbSAnbm9kZTpmcyc7CmltcG9ydCB7IGhvbWVkaXIgfSBmcm9tICdub2RlOm9zJzsKaW1wb3J0IHsgam9pbiB9IGZyb20gJ25vZGU6cGF0aCc7CgovKiog7ZiE7J6sIOyekeyXhSDrlJTroInthLDrpqzsnZggZ2l0IHJlbW90ZSBvcmlnaW4gVVJM7J2EIOy2lOy2nO2VnOuLpCAo7Iuk7YyoIOyLnCBudWxsKS4gKi8KZXhwb3J0IGZ1bmN0aW9uIGdldEdpdFJlbW90ZVVybChjd2QpIHsKICB0cnkgewogICAgY29uc3Qgb3V0ID0gZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3JlbW90ZScsICdnZXQtdXJsJywgJ29yaWdpbiddLCB7CiAgICAgIGN3ZCwKICAgICAgZW5jb2Rpbmc6ICd1dGY4JywKICAgICAgdGltZW91dDogMzAwMCwKICAgICAgc3RkaW86IFsnaWdub3JlJywgJ3BpcGUnLCAnaWdub3JlJ10sCiAgICB9KTsKICAgIHJldHVybiBvdXQudHJpbSgpIHx8IG51bGw7CiAgfSBjYXRjaCB7CiAgICByZXR1cm4gbnVsbDsKICB9Cn0KCi8qKiDtlITroZzsoJ3tirgg66Gc7LusIOyEpOyglSgubXVzdGVyL2NvbmZpZy5qc29uKSwg7ZmY6rK967OA7IiYLCDrmJDripQg7KCE7JetIOyEpOyglSh+Ly5tdXN0ZXIvY29uZmlnLmpzb24pIOuhnOuTnCAqLwpleHBvcnQgZnVuY3Rpb24gbG9hZENvbmZpZygKICBjd2QsCiAgZW52ID0gcHJvY2Vzcy5lbnYsCiAgZ2xvYmFsUGF0aCA9IGpvaW4oaG9tZWRpcigpLCAnLm11c3RlcicsICdjb25maWcuanNvbicpLAopIHsKICBpZiAoY3dkKSB7CiAgICBjb25zdCBsb2NhbFBhdGggPSBqb2luKGN3ZCwgJy5tdXN0ZXInLCAnY29uZmlnLmpzb24nKTsKICAgIGlmIChleGlzdHNTeW5jKGxvY2FsUGF0aCkpIHsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhsb2NhbFBhdGgsICd1dGY4JykpOwogICAgICAgIGNvbnN0IGFnZW50SWQgPSBwYXJzZWQuYWdlbnRzPy5bJ2NsYXVkZS1jb2RlJ10gfHwgcGFyc2VkLmFnZW50SWQ7CiAgICAgICAgaWYgKHBhcnNlZC5hcGlVcmwgJiYgcGFyc2VkLmFwaUtleSAmJiBhZ2VudElkKSB7CiAgICAgICAgICByZXR1cm4geyBhcGlVcmw6IHBhcnNlZC5hcGlVcmwsIGFwaUtleTogcGFyc2VkLmFwaUtleSwgYWdlbnRJZCB9OwogICAgICAgIH0KICAgICAgfSBjYXRjaCB7CiAgICAgICAgLy8g7IaQ7IOB65CcIOyEpOyglSDtjIzsnbzsnYAg7KGw7Jqp7Z6IIOustOyLnO2VmOqzoCDtmZjqsr3rs4DsiJjroZwg7Y+067Cx7ZWc64ukLgogICAgICB9CiAgICB9CiAgfQoKICBjb25zdCB7IE1VU1RFUl9BUElfVVJMLCBNVVNURVJfQVBJX0tFWSwgTVVTVEVSX0FHRU5UX0lEIH0gPSBlbnY7CiAgaWYgKE1VU1RFUl9BUElfVVJMICYmIE1VU1RFUl9BUElfS0VZICYmIE1VU1RFUl9BR0VOVF9JRCkgewogICAgcmV0dXJuIHsgYXBpVXJsOiBNVVNURVJfQVBJX1VSTCwgYXBpS2V5OiBNVVNURVJfQVBJX0tFWSwgYWdlbnRJZDogTVVTVEVSX0FHRU5UX0lEIH07CiAgfQoKICAvLyAz7Iic7JyEOiDsoITsl60g7ISk7KCVICh+Ly5tdXN0ZXIvY29uZmlnLmpzb24pIOKAlCBnaXQgcmVtb3RlIOq4sOuwmCDsnpDrj5kg65287Jqw7YyFCiAgaWYgKGdsb2JhbFBhdGggJiYgZXhpc3RzU3luYyhnbG9iYWxQYXRoKSkgewogICAgdHJ5IHsKICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoZ2xvYmFsUGF0aCwgJ3V0ZjgnKSk7CiAgICAgIGlmIChwYXJzZWQuYXBpVXJsICYmIHBhcnNlZC5hcGlLZXkpIHsKICAgICAgICByZXR1cm4gewogICAgICAgICAgYXBpVXJsOiBwYXJzZWQuYXBpVXJsLAogICAgICAgICAgYXBpS2V5OiBwYXJzZWQuYXBpS2V5LAogICAgICAgICAgYWdlbnRJZDogcGFyc2VkLmFnZW50SWQgfHwgbnVsbCwKICAgICAgICAgIGlzR2xvYmFsOiB0cnVlLAogICAgICAgIH07CiAgICAgIH0KICAgIH0gY2F0Y2gge30KICB9CgogIHJldHVybiBudWxsOwp9CgovKioKICogdHJhbnNjcmlwdCBKU09OTOyXkOyEnCDslrTsi5zsiqTthLTtirgg7YS07J2YIHVzYWdl66W8IOuqqOuRkCDrjZTtlZzri6QuCiAqIOyLpOy4oSDtmZXsnbgoMjAyNi0wOS0xNik6IOqwgSDspITsnYAge3R5cGUsIG1lc3NhZ2U6e3VzYWdlOntpbnB1dF90b2tlbnMsIG91dHB1dF90b2tlbnMsCiAqIGNhY2hlX2NyZWF0aW9uX2lucHV0X3Rva2VucywgY2FjaGVfcmVhZF9pbnB1dF90b2tlbnN9fSwgLi4ufSDtmJXtg5zsnbTqs6AsIHR5cGXsnbQKICogImFzc2lzdGFudCLsnbgg7KSE7JeQ66eMIHVzYWdl6rCAIOyeiOuLpC4g7LqQ7IucIO2GoO2BsOuPhCDsi6TsoJzroZwg7JO0IOyaqeufieydtOuvgOuhnCDtlansgrDsl5Ag7Y+s7ZWo7ZWc64ukLgogKi8KZXhwb3J0IGZ1bmN0aW9uIHN1bVVzYWdlRnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdFBhdGgpIHsKICBpZiAoIWV4aXN0c1N5bmModHJhbnNjcmlwdFBhdGgpKSByZXR1cm4geyB0b2tlbnNfdXNlZDogMCwgb3V0cHV0X3Rva2VuczogMCwgdHVybnM6IDAgfTsKCiAgbGV0IGlucHV0U2lkZSA9IDA7CiAgbGV0IG91dHB1dFNpZGUgPSAwOwogIGxldCB0dXJucyA9IDA7CiAgY29uc3QgbGluZXMgPSByZWFkRmlsZVN5bmModHJhbnNjcmlwdFBhdGgsICd1dGY4Jykuc3BsaXQoJ1xuJyk7CgogIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykgewogICAgaWYgKCFsaW5lLnRyaW0oKSkgY29udGludWU7CiAgICBsZXQgZW50cnk7CiAgICB0cnkgewogICAgICBlbnRyeSA9IEpTT04ucGFyc2UobGluZSk7CiAgICB9IGNhdGNoIHsKICAgICAgY29udGludWU7CiAgICB9CiAgICBpZiAoZW50cnkudHlwZSAhPT0gJ2Fzc2lzdGFudCcpIGNvbnRpbnVlOwogICAgY29uc3QgdXNhZ2UgPSBlbnRyeS5tZXNzYWdlPy51c2FnZTsKICAgIGlmICghdXNhZ2UpIGNvbnRpbnVlOwoKICAgIGlucHV0U2lkZSArPQogICAgICAodXNhZ2UuaW5wdXRfdG9rZW5zID8/IDApICsKICAgICAgKHVzYWdlLmNhY2hlX2NyZWF0aW9uX2lucHV0X3Rva2VucyA/PyAwKSArCiAgICAgICh1c2FnZS5jYWNoZV9yZWFkX2lucHV0X3Rva2VucyA/PyAwKTsKICAgIG91dHB1dFNpZGUgKz0gdXNhZ2Uub3V0cHV0X3Rva2VucyA/PyAwOwogICAgdHVybnMgKz0gMTsKICB9CgogIHJldHVybiB7IHRva2Vuc191c2VkOiBpbnB1dFNpZGUgKyBvdXRwdXRTaWRlLCBvdXRwdXRfdG9rZW5zOiBvdXRwdXRTaWRlLCB0dXJucyB9Owp9CgovKioKICog65GQIOyalOycqChNVVNURVJfQ09TVF9QRVJfTVRPS19JTlBVVC9PVVRQVVQsIDFNIO2GoO2BsOuLuSBVU0Qp7J20IOuqqOuRkCDshKTsoJXrkJwg6rK97Jqw7JeQ66eMCiAqIOu5hOyaqeydhCDqs4TsgrDtlZzri6QuIO2VmOuCmOunjCDsnojqsbDrgpgg65GYIOuLpCDsl4bsnLzrqbQgdW5kZWZpbmVk66W8IOuPjOugpOyjvOqzoCDruYTsmqnsnYAg67mE7JuMIOuRlOuLpCDigJQKICog66qo6424wrftlIzrnpzrp4jri6Qg64uk66W4IOuLqOqwgOulvCDstpTsuKHtlbTshJwg7LGE7Jqw7KeAIOyViuuKlOuLpChtZW1vcnk6IOq4sOyIoCDstZzsi6DtmZQg7ZmV7J24IOybkOy5meqzvAogKiDqsJnsnYAg7J207JygIOKAlCDqt7zqsbAg7JeG64qUIOyIq+yekOulvCDrp4zrk6Tsp4Ag7JWK64qU64ukKS4KICovCmV4cG9ydCBmdW5jdGlvbiBlc3RpbWF0ZUNvc3QodXNhZ2UsIGVudikgewogIGNvbnN0IGlucHV0UmF0ZSA9IE51bWJlcihlbnYuTVVTVEVSX0NPU1RfUEVSX01UT0tfSU5QVVQpOwogIGNvbnN0IG91dHB1dFJhdGUgPSBOdW1iZXIoZW52Lk1VU1RFUl9DT1NUX1BFUl9NVE9LX09VVFBVVCk7CiAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoaW5wdXRSYXRlKSB8fCAhTnVtYmVyLmlzRmluaXRlKG91dHB1dFJhdGUpKSByZXR1cm4gdW5kZWZpbmVkOwoKICBjb25zdCBpbnB1dFNpZGUgPSB1c2FnZS50b2tlbnNfdXNlZCAtIHVzYWdlLm91dHB1dF90b2tlbnM7CiAgY29uc3QgY29zdCA9IChpbnB1dFNpZGUgLyAxXzAwMF8wMDApICogaW5wdXRSYXRlICsgKHVzYWdlLm91dHB1dF90b2tlbnMgLyAxXzAwMF8wMDApICogb3V0cHV0UmF0ZTsKICByZXR1cm4gY29zdC50b0ZpeGVkKDYpOwp9CgpmdW5jdGlvbiBzdGF0ZVBhdGhGb3Ioc2Vzc2lvbklkKSB7CiAgcmV0dXJuIGpvaW4oaG9tZWRpcigpLCAnLm11c3RlcicsICdydW5zJywgYCR7c2Vzc2lvbklkfS5qc29uYCk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGFwaUNhbGwoY29uZmlnLCBtZXRob2QsIHBhdGgsIGJvZHkpIHsKICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChgJHtjb25maWcuYXBpVXJsfSR7cGF0aH1gLCB7CiAgICBtZXRob2QsCiAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsICdYLUFQSS1LZXknOiBjb25maWcuYXBpS2V5IH0sCiAgICBib2R5OiBib2R5ID8gSlNPTi5zdHJpbmdpZnkoYm9keSkgOiB1bmRlZmluZWQsCiAgfSk7CiAgaWYgKCFyZXMub2spIHsKICAgIHRocm93IG5ldyBFcnJvcihgTXVzdGVyIEFQSSAke21ldGhvZH0gJHtwYXRofSAtPiAke3Jlcy5zdGF0dXN9ICR7YXdhaXQgcmVzLnRleHQoKX1gKTsKICB9CiAgcmV0dXJuIHJlcy5qc29uKCk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNlc3Npb25TdGFydChob29rLCBlbnYpIHsKICBjb25zdCBzdGF0ZVBhdGggPSBzdGF0ZVBhdGhGb3IoaG9vay5zZXNzaW9uX2lkKTsKICBpZiAoZXhpc3RzU3luYyhzdGF0ZVBhdGgpKSByZXR1cm47IC8vIOydtOuvuCDsi5zsnpEg6riw66Gd7J20IOyeiOuLpCDigJQg7Lu07Yyp7IWYIOuTseycvOuhnCDri6Tsi5wg67aI66awIOqyveyasC4KCiAgY29uc3QgY29uZmlnID0gbG9hZENvbmZpZyhob29rLmN3ZCwgZW52KTsKICBpZiAoIWNvbmZpZykgcmV0dXJuOwoKICBpZiAoY29uZmlnLmlzR2xvYmFsKSB7CiAgICBjb25zdCBnaXRSZW1vdGUgPSBnZXRHaXRSZW1vdGVVcmwoaG9vay5jd2QpOwogICAgaWYgKCFnaXRSZW1vdGUpIHJldHVybjsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHJ1biA9IGF3YWl0IGFwaUNhbGwoY29uZmlnLCAnUE9TVCcsIGAvYWdlbnQtcnVucy9ieS1yZXBvYCwgewogICAgICAgIHJlcG9fdXJsOiBnaXRSZW1vdGUsCiAgICAgICAgYWdlbnRfbmFtZTogJ2NsYXVkZS1jb2RlJywKICAgICAgICBzdGF0dXM6ICdydW5uaW5nJywKICAgICAgICB0b2tlbnNfdXNlZDogMCwKICAgICAgICBjb3N0OiAnMCcsCiAgICAgIH0pOwogICAgICBta2RpclN5bmMoam9pbihob21lZGlyKCksICcubXVzdGVyJywgJ3J1bnMnKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7CiAgICAgIHdyaXRlRmlsZVN5bmMoc3RhdGVQYXRoLCBKU09OLnN0cmluZ2lmeSh7IHJ1bl9pZDogcnVuLmlkLCBjd2Q6IGhvb2suY3dkIH0pLCAndXRmOCcpOwogICAgfSBjYXRjaCAoZXJyKSB7CiAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBbTXVzdGVyXSBHaXQg7J6Q64+ZIOudvOyasO2MhSDsi5zsnpEg6rG064SI65yAOiAke2Vyci5tZXNzYWdlfVxuYCk7CiAgICB9CiAgICByZXR1cm47CiAgfQoKICBjb25zdCBydW4gPSBhd2FpdCBhcGlDYWxsKGNvbmZpZywgJ1BPU1QnLCBgL2FnZW50cy8ke2NvbmZpZy5hZ2VudElkfS9ydW5zYCwgdW5kZWZpbmVkKTsKCiAgbWtkaXJTeW5jKGpvaW4oaG9tZWRpcigpLCAnLm11c3RlcicsICdydW5zJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwogIHdyaXRlRmlsZVN5bmMoc3RhdGVQYXRoLCBKU09OLnN0cmluZ2lmeSh7IHJ1bl9pZDogcnVuLmlkLCBjd2Q6IGhvb2suY3dkIH0pLCAndXRmOCcpOwp9Cgphc3luYyBmdW5jdGlvbiBoYW5kbGVTZXNzaW9uRW5kKGhvb2ssIGVudikgewogIGNvbnN0IHN0YXRlUGF0aCA9IHN0YXRlUGF0aEZvcihob29rLnNlc3Npb25faWQpOwogIGlmICghZXhpc3RzU3luYyhzdGF0ZVBhdGgpKSByZXR1cm47IC8vIOuMgOydke2VmOuKlCDsi5zsnpEg6riw66Gd7J20IOyXhuuLpCDigJQg67O06rOg7ZWgIOqyjCDsl4bri6QuCgogIGNvbnN0IHN0YXRlID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoc3RhdGVQYXRoLCAndXRmOCcpKTsKICBjb25zdCBjb25maWcgPSBsb2FkQ29uZmlnKHN0YXRlLmN3ZCA/PyBob29rLmN3ZCwgZW52KTsKICBpZiAoIWNvbmZpZykgewogICAgcm1TeW5jKHN0YXRlUGF0aCwgeyBmb3JjZTogdHJ1ZSB9KTsKICAgIHJldHVybjsKICB9CgogIGNvbnN0IHVzYWdlID0gc3VtVXNhZ2VGcm9tVHJhbnNjcmlwdChob29rLnRyYW5zY3JpcHRfcGF0aCk7CiAgY29uc3QgY29zdCA9IGVzdGltYXRlQ29zdCh1c2FnZSwgZW52KTsKCiAgYXdhaXQgYXBpQ2FsbChjb25maWcsICdQQVRDSCcsIGAvYWdlbnQtcnVucy8ke3N0YXRlLnJ1bl9pZH1gLCB7CiAgICBzdGF0dXM6ICdzdWNjZWVkZWQnLAogICAgdG9rZW5zX3VzZWQ6IHVzYWdlLnRva2Vuc191c2VkLAogICAgLi4uKGNvc3QgIT09IHVuZGVmaW5lZCA/IHsgY29zdCB9IDoge30pLAogIH0pOwoKICBybVN5bmMoc3RhdGVQYXRoLCB7IGZvcmNlOiB0cnVlIH0pOwp9Cgphc3luYyBmdW5jdGlvbiBtYWluKCkgewogIGNvbnN0IHJhdyA9IHJlYWRGaWxlU3luYygwLCAndXRmOCcpOwogIGNvbnN0IGhvb2sgPSBKU09OLnBhcnNlKHJhdyk7CgogIGlmIChob29rLmhvb2tfZXZlbnRfbmFtZSA9PT0gJ1Nlc3Npb25TdGFydCcpIHsKICAgIGF3YWl0IGhhbmRsZVNlc3Npb25TdGFydChob29rLCBwcm9jZXNzLmVudik7CiAgfSBlbHNlIGlmIChob29rLmhvb2tfZXZlbnRfbmFtZSA9PT0gJ1Nlc3Npb25FbmQnKSB7CiAgICBhd2FpdCBoYW5kbGVTZXNzaW9uRW5kKGhvb2ssIHByb2Nlc3MuZW52KTsKICB9Cn0KCmlmIChpbXBvcnQubWV0YS51cmwgPT09IGBmaWxlOi8vJHtwcm9jZXNzLmFyZ3ZbMV19YCkgewogIG1haW4oKQogICAgLmNhdGNoKChlcnIpID0+IHsKICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoYFttdXN0ZXItcmVwb3J0LXVzYWdlXSAke2Vycj8uc3RhY2sgPz8gZXJyfVxuYCk7CiAgICB9KQogICAgLmZpbmFsbHkoKCkgPT4gewogICAgICBwcm9jZXNzLmV4aXQoMCk7IC8vIO2bhSDsi6TtjKjroZwgQ2xhdWRlIENvZGUg7IS47IWY7J2EIOunieyngCDslYrripTri6QuCiAgICB9KTsKfQo=", "base64").toString("utf8");
export const EMBEDDED_ANTIGRAVITY_HOOK = Buffer.from("IyEvdXNyL2Jpbi9lbnYgbm9kZQovLwovLyBBbnRpZ3Jhdml0eSAoR2VtaW5pIENMSSkgU3RvcCDtm4XsnLzroZwg7Iuk7KCcIOyEuOyFmCDthqDtgbAg7IKs7Jqp65+J7J2EIE11c3RlcuyXkCDrs7Tqs6DtlZzri6QuCi8vCi8vIEFudGlncmF2aXR5IOyEuOyFmCDsmYTro4wg7IucIC5hZ2VudHMvaG9va3MuanNvbiDrmJDripQgfi8uZ2VtaW5pL2NvbmZpZy9ob29rcy5qc29u7JeQIOuTseuhneuQnAovLyBTdG9wIO2bheyXkCDsnZjtlbQg7Iuk7ZaJ65Cc64ukLgovLyBzdGRpbuycvOuhnCDrk6TslrTsmKTripQgY29udmVyc2F0aW9uSWQsIHdvcmtzcGFjZVBhdGhz66W8IOydveqzoCwKLy8gfi8uZ2VtaW5pL2FudGlncmF2aXR5L2NvbnZlcnNhdGlvbnMvJHtjb252ZXJzYXRpb25JZH0uZGIgKOuYkOuKlCB0cmFuc2NyaXB0KeyXkOyEnAovLyDsoJXtmZXtlZwg7J6F7Lac66ClIO2GoO2BsOydhCDsp5Hqs4TtlZjsl6wgTXVzdGVyIEFQSeuhnCDsoIHsnqztlZzri6QuCi8vCi8vIOyLpO2MqO2VtOuPhCDshLjshZjsnYQg67Cp7ZW07ZWY7KeAIOyViuuPhOuhnSDtla3sg4EgZXhpdCBjb2RlIDDsnYQg67O07J6l7ZWY6rOgLAovLyBzdGRvdXTsnLzroZwge33rpbwg7Lac66Cl7ZWc64ukLgoKaW1wb3J0IHsgZXhlY0ZpbGVTeW5jIH0gZnJvbSAnbm9kZTpjaGlsZF9wcm9jZXNzJzsKaW1wb3J0IHsgcmVhZEZpbGVTeW5jLCBleGlzdHNTeW5jLCBta2RpclN5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICdub2RlOmZzJzsKaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gJ25vZGU6bW9kdWxlJzsKaW1wb3J0IHsgaG9tZWRpciB9IGZyb20gJ25vZGU6b3MnOwppbXBvcnQgeyBqb2luIH0gZnJvbSAnbm9kZTpwYXRoJzsKCmNvbnN0IHJlcXVpcmUgPSBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7CgovKiog7ZiE7J6sIOyekeyXhSDrlJTroInthLDrpqzsnZggZ2l0IHJlbW90ZSBvcmlnaW4gVVJM7J2EIOy2lOy2nO2VnOuLpCAo7Iuk7YyoIOyLnCBudWxsKS4gKi8KZXhwb3J0IGZ1bmN0aW9uIGdldEdpdFJlbW90ZVVybChjd2QpIHsKICB0cnkgewogICAgY29uc3Qgb3V0ID0gZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3JlbW90ZScsICdnZXQtdXJsJywgJ29yaWdpbiddLCB7CiAgICAgIGN3ZCwKICAgICAgZW5jb2Rpbmc6ICd1dGY4JywKICAgICAgdGltZW91dDogMzAwMCwKICAgICAgc3RkaW86IFsnaWdub3JlJywgJ3BpcGUnLCAnaWdub3JlJ10sCiAgICB9KTsKICAgIHJldHVybiBvdXQudHJpbSgpIHx8IG51bGw7CiAgfSBjYXRjaCB7CiAgICByZXR1cm4gbnVsbDsKICB9Cn0KCi8qKiBQcm90b2J1ZiB2YXJpbnQg67CPIGxlbmd0aC1kZWxpbWl0ZWQg65SU7L2U642UICovCmV4cG9ydCBmdW5jdGlvbiBwYXJzZVByb3RvKGJ1ZikgewogIGxldCBwb3MgPSAwOwogIGNvbnN0IGZpZWxkcyA9IHt9OwogIHdoaWxlIChwb3MgPCBidWYubGVuZ3RoKSB7CiAgICBsZXQgdGFnID0gMDsKICAgIGxldCBzaGlmdCA9IDA7CiAgICB3aGlsZSAocG9zIDwgYnVmLmxlbmd0aCkgewogICAgICBjb25zdCBiID0gYnVmW3BvcysrXTsKICAgICAgdGFnIHw9IChiICYgMHg3ZikgPDwgc2hpZnQ7CiAgICAgIHNoaWZ0ICs9IDc7CiAgICAgIGlmICghKGIgJiAweDgwKSkgYnJlYWs7CiAgICB9CiAgICBjb25zdCBmaWVsZE51bSA9IHRhZyA+PiAzOwogICAgY29uc3Qgd2lyZVR5cGUgPSB0YWcgJiAweDA3OwogICAgaWYgKHdpcmVUeXBlID09PSAwKSB7CiAgICAgIC8vIHZhcmludAogICAgICBsZXQgdmFsID0gMDsKICAgICAgbGV0IHZzaGlmdCA9IDA7CiAgICAgIHdoaWxlIChwb3MgPCBidWYubGVuZ3RoKSB7CiAgICAgICAgY29uc3QgYiA9IGJ1Zltwb3MrK107CiAgICAgICAgdmFsICs9IChiICYgMHg3ZikgKiBNYXRoLnBvdygyLCB2c2hpZnQpOwogICAgICAgIHZzaGlmdCArPSA3OwogICAgICAgIGlmICghKGIgJiAweDgwKSkgYnJlYWs7CiAgICAgIH0KICAgICAgZmllbGRzW2ZpZWxkTnVtXSA9IHZhbDsKICAgIH0gZWxzZSBpZiAod2lyZVR5cGUgPT09IDIpIHsKICAgICAgLy8gbGVuZ3RoLWRlbGltaXRlZAogICAgICBsZXQgbGVuID0gMDsKICAgICAgbGV0IGxzaGlmdCA9IDA7CiAgICAgIHdoaWxlIChwb3MgPCBidWYubGVuZ3RoKSB7CiAgICAgICAgY29uc3QgYiA9IGJ1Zltwb3MrK107CiAgICAgICAgbGVuICs9IChiICYgMHg3ZikgKiBNYXRoLnBvdygyLCBsc2hpZnQpOwogICAgICAgIGxzaGlmdCArPSA3OwogICAgICAgIGlmICghKGIgJiAweDgwKSkgYnJlYWs7CiAgICAgIH0KICAgICAgZmllbGRzW2ZpZWxkTnVtXSA9IGJ1Zi5zdWJhcnJheShwb3MsIHBvcyArIGxlbik7CiAgICAgIHBvcyArPSBsZW47CiAgICB9IGVsc2UgaWYgKHdpcmVUeXBlID09PSAxKSB7CiAgICAgIHBvcyArPSA4OwogICAgfSBlbHNlIGlmICh3aXJlVHlwZSA9PT0gNSkgewogICAgICBwb3MgKz0gNDsKICAgIH0gZWxzZSB7CiAgICAgIGJyZWFrOwogICAgfQogIH0KICByZXR1cm4gZmllbGRzOwp9CgovKiog7ZSE66Gc7KCd7Yq4IOuhnOy7rCDshKTsoJUoLm11c3Rlci9jb25maWcuanNvbiksIO2ZmOqyveuzgOyImCwg65iQ64qUIOyghOyXrSDshKTsoJUofi8ubXVzdGVyL2NvbmZpZy5qc29uKSDroZzrk5wgKi8KZXhwb3J0IGZ1bmN0aW9uIGxvYWRDb25maWcoCiAgY3dkLAogIGVudiA9IHByb2Nlc3MuZW52LAogIGdsb2JhbFBhdGggPSBqb2luKGhvbWVkaXIoKSwgJy5tdXN0ZXInLCAnY29uZmlnLmpzb24nKSwKKSB7CiAgLy8gMeyInOychDog7ZSE66Gc7KCd7Yq4IOuhnOy7rCDshKTsoJUgKC5tdXN0ZXIvY29uZmlnLmpzb24pCiAgaWYgKGN3ZCkgewogICAgY29uc3QgbG9jYWxQYXRoID0gam9pbihjd2QsICcubXVzdGVyJywgJ2NvbmZpZy5qc29uJyk7CiAgICBpZiAoZXhpc3RzU3luYyhsb2NhbFBhdGgpKSB7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMobG9jYWxQYXRoLCAndXRmOCcpKTsKICAgICAgICBjb25zdCBhZ2VudElkID0gcGFyc2VkLmFnZW50cz8uYW50aWdyYXZpdHkgfHwgcGFyc2VkLmFnZW50SWQ7CiAgICAgICAgaWYgKHBhcnNlZC5hcGlVcmwgJiYgcGFyc2VkLmFwaUtleSAmJiBhZ2VudElkKSB7CiAgICAgICAgICByZXR1cm4geyBhcGlVcmw6IHBhcnNlZC5hcGlVcmwsIGFwaUtleTogcGFyc2VkLmFwaUtleSwgYWdlbnRJZCB9OwogICAgICAgIH0KICAgICAgfSBjYXRjaCB7CiAgICAgICAgLy8g66y07Iuc7ZWY6rOgIO2ZmOqyveuzgOyImOuhnCDtj7TrsLEKICAgICAgfQogICAgfQogIH0KCiAgY29uc3QgeyBNVVNURVJfQVBJX1VSTCwgTVVTVEVSX0FQSV9LRVksIE1VU1RFUl9BR0VOVF9JRCB9ID0gZW52OwogIGlmIChNVVNURVJfQVBJX1VSTCAmJiBNVVNURVJfQVBJX0tFWSAmJiBNVVNURVJfQUdFTlRfSUQpIHsKICAgIHJldHVybiB7IGFwaVVybDogTVVTVEVSX0FQSV9VUkwsIGFwaUtleTogTVVTVEVSX0FQSV9LRVksIGFnZW50SWQ6IE1VU1RFUl9BR0VOVF9JRCB9OwogIH0KCiAgLy8gM+yInOychDog7KCE7JetIOyEpOyglSAofi8ubXVzdGVyL2NvbmZpZy5qc29uKSDigJQgZ2l0IHJlbW90ZSDquLDrsJgg7J6Q64+ZIOudvOyasO2MheyXkCDsgqzsmqkKICBpZiAoZ2xvYmFsUGF0aCAmJiBleGlzdHNTeW5jKGdsb2JhbFBhdGgpKSB7CiAgICB0cnkgewogICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhnbG9iYWxQYXRoLCAndXRmOCcpKTsKICAgICAgaWYgKHBhcnNlZC5hcGlVcmwgJiYgcGFyc2VkLmFwaUtleSkgewogICAgICAgIHJldHVybiB7CiAgICAgICAgICBhcGlVcmw6IHBhcnNlZC5hcGlVcmwsCiAgICAgICAgICBhcGlLZXk6IHBhcnNlZC5hcGlLZXksCiAgICAgICAgICBhZ2VudElkOiBwYXJzZWQuYWdlbnRJZCB8fCBudWxsLAogICAgICAgICAgaXNHbG9iYWw6IHRydWUsCiAgICAgICAgfTsKICAgICAgfQogICAgfSBjYXRjaCB7fQogIH0KCiAgcmV0dXJuIG51bGw7Cn0KCi8qKiB0cmFuc2NyaXB0Lmpzb25sIO2PtOuwsSDthqDtgbAg6rOE7IKwICovCmV4cG9ydCBmdW5jdGlvbiBzdW1Vc2FnZUZyb21UcmFuc2NyaXB0KHRyYW5zY3JpcHRQYXRoKSB7CiAgaWYgKCF0cmFuc2NyaXB0UGF0aCB8fCAhZXhpc3RzU3luYyh0cmFuc2NyaXB0UGF0aCkpIHsKICAgIHJldHVybiB7IHRva2Vuc191c2VkOiAwLCB0dXJuczogMCwgc3RhcnRlZF9hdDogbnVsbCwgZW5kZWRfYXQ6IG51bGwgfTsKICB9CgogIGxldCBjaGFycyA9IDA7CiAgbGV0IHR1cm5zID0gMDsKICBsZXQgc3RhcnRlZF9hdCA9IG51bGw7CiAgbGV0IGVuZGVkX2F0ID0gbnVsbDsKCiAgdHJ5IHsKICAgIGNvbnN0IGxpbmVzID0gcmVhZEZpbGVTeW5jKHRyYW5zY3JpcHRQYXRoLCAndXRmOCcpLnNwbGl0KCdcbicpOwogICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7CiAgICAgIGlmICghbGluZS50cmltKCkpIGNvbnRpbnVlOwogICAgICBsZXQgZW50cnk7CiAgICAgIHRyeSB7CiAgICAgICAgZW50cnkgPSBKU09OLnBhcnNlKGxpbmUpOwogICAgICB9IGNhdGNoIHsKICAgICAgICBjb250aW51ZTsKICAgICAgfQogICAgICBjb25zdCB0cyA9IGVudHJ5LmNyZWF0ZWRfYXQ7CiAgICAgIGlmICh0cykgewogICAgICAgIGlmICghc3RhcnRlZF9hdCkgc3RhcnRlZF9hdCA9IHRzOwogICAgICAgIGVuZGVkX2F0ID0gdHM7CiAgICAgIH0KICAgICAgaWYgKGVudHJ5LmNvbnRlbnQpIGNoYXJzICs9IFN0cmluZyhlbnRyeS5jb250ZW50KS5sZW5ndGg7CiAgICAgIGlmIChlbnRyeS50aGlua2luZykgY2hhcnMgKz0gU3RyaW5nKGVudHJ5LnRoaW5raW5nKS5sZW5ndGg7CiAgICAgIHR1cm5zKys7CiAgICB9CiAgfSBjYXRjaCB7CiAgICAvLyBpZ25vcmUKICB9CgogIC8vIDEg7Yag7YGwIH49IOyVvSA07J6QICjsmIHslrQv7L2U65OcIOq4sOykgCDqt7zsgqzsuZgpCiAgY29uc3QgdG9rZW5zX3VzZWQgPSBNYXRoLnJvdW5kKGNoYXJzIC8gNCk7CiAgcmV0dXJuIHsgdG9rZW5zX3VzZWQsIHR1cm5zLCBzdGFydGVkX2F0LCBlbmRlZF9hdCB9Owp9CgovKiogU1FMaXRlIERC7JeQ7IScIFByb3RvYnVmIFRhZyA5IOyLpOy4oSDthqDtgbAg7LaU7LacICovCmV4cG9ydCBmdW5jdGlvbiBzdW1Vc2FnZUZyb21EYihjb252ZXJzYXRpb25JZCkgewogIGlmICghY29udmVyc2F0aW9uSWQpIHJldHVybiBudWxsOwogIGNvbnN0IGRiUGF0aCA9IGpvaW4oaG9tZWRpcigpLCAnLmdlbWluaS9hbnRpZ3Jhdml0eS9jb252ZXJzYXRpb25zJywgYCR7Y29udmVyc2F0aW9uSWR9LmRiYCk7CiAgaWYgKCFleGlzdHNTeW5jKGRiUGF0aCkpIHJldHVybiBudWxsOwoKICB0cnkgewogICAgY29uc3QgeyBEYXRhYmFzZVN5bmMgfSA9IHJlcXVpcmUoJ25vZGU6c3FsaXRlJyk7CiAgICBjb25zdCBkYiA9IG5ldyBEYXRhYmFzZVN5bmMoZGJQYXRoLCB7IHJlYWRPbmx5OiB0cnVlIH0pOwogICAgY29uc3Qgc3RtdCA9IGRiLnByZXBhcmUoJ1NFTEVDVCBpZHgsIG1ldGFkYXRhIEZST00gc3RlcHMgV0hFUkUgbWV0YWRhdGEgSVMgTk9UIE5VTEwnKTsKICAgIGxldCB0b3RhbElucHV0ID0gMDsKICAgIGxldCB0b3RhbE91dHB1dCA9IDA7CiAgICBsZXQgdHVybnMgPSAwOwoKICAgIGZvciAoY29uc3Qgcm93IG9mIHN0bXQuYWxsKCkpIHsKICAgICAgaWYgKCFyb3cubWV0YWRhdGEpIGNvbnRpbnVlOwogICAgICBjb25zdCBmID0gcGFyc2VQcm90byhCdWZmZXIuZnJvbShyb3cubWV0YWRhdGEpKTsKICAgICAgaWYgKGZbOV0pIHsKICAgICAgICBjb25zdCBzdWIgPSBwYXJzZVByb3RvKGZbOV0pOwogICAgICAgIGNvbnN0IGlucHV0VG9rZW5zID0gc3ViWzJdIHx8IDA7CiAgICAgICAgY29uc3Qgb3V0cHV0VG9rZW5zID0gc3ViWzNdIHx8IDA7CiAgICAgICAgaWYgKGlucHV0VG9rZW5zIHx8IG91dHB1dFRva2VucykgewogICAgICAgICAgdG90YWxJbnB1dCArPSBpbnB1dFRva2VuczsKICAgICAgICAgIHRvdGFsT3V0cHV0ICs9IG91dHB1dFRva2VuczsKICAgICAgICAgIHR1cm5zKys7CiAgICAgICAgfQogICAgICB9CiAgICB9CiAgICBkYi5jbG9zZSgpOwoKICAgIGNvbnN0IHRvdGFsVG9rZW5zID0gdG90YWxJbnB1dCArIHRvdGFsT3V0cHV0OwogICAgcmV0dXJuIHsgdG9rZW5zX3VzZWQ6IHRvdGFsVG9rZW5zLCB0dXJucywgc3RhcnRlZF9hdDogbnVsbCwgZW5kZWRfYXQ6IG51bGwgfTsKICB9IGNhdGNoIHsKICAgIHJldHVybiBudWxsOwogIH0KfQoKZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RBbnRpZ3Jhdml0eVVzYWdlKGNvbnZlcnNhdGlvbklkLCB0cmFuc2NyaXB0UGF0aCkgewogIGNvbnN0IGRiVXNhZ2UgPSBzdW1Vc2FnZUZyb21EYihjb252ZXJzYXRpb25JZCk7CiAgY29uc3QgdHJhbnNjcmlwdFVzYWdlID0gc3VtVXNhZ2VGcm9tVHJhbnNjcmlwdCh0cmFuc2NyaXB0UGF0aCk7CgogIGlmIChkYlVzYWdlICYmIGRiVXNhZ2UudG9rZW5zX3VzZWQgPiAwKSB7CiAgICByZXR1cm4gewogICAgICB0b2tlbnNfdXNlZDogZGJVc2FnZS50b2tlbnNfdXNlZCwKICAgICAgdHVybnM6IGRiVXNhZ2UudHVybnMsCiAgICAgIHN0YXJ0ZWRfYXQ6IHRyYW5zY3JpcHRVc2FnZS5zdGFydGVkX2F0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwKICAgICAgZW5kZWRfYXQ6IHRyYW5zY3JpcHRVc2FnZS5lbmRlZF9hdCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksCiAgICB9OwogIH0KCiAgcmV0dXJuIHRyYW5zY3JpcHRVc2FnZTsKfQoKYXN5bmMgZnVuY3Rpb24gYXBpQ2FsbChjb25maWcsIG1ldGhvZCwgcGF0aCwgYm9keSkgewogIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGAke2NvbmZpZy5hcGlVcmx9JHtwYXRofWAsIHsKICAgIG1ldGhvZCwKICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgJ1gtQVBJLUtleSc6IGNvbmZpZy5hcGlLZXkgfSwKICAgIGJvZHk6IGJvZHkgPyBKU09OLnN0cmluZ2lmeShib2R5KSA6IHVuZGVmaW5lZCwKICB9KTsKICBpZiAoIXJlcy5vaykgewogICAgdGhyb3cgbmV3IEVycm9yKGBNdXN0ZXIgQVBJICR7bWV0aG9kfSAke3BhdGh9IC0+ICR7cmVzLnN0YXR1c30gJHthd2FpdCByZXMudGV4dCgpfWApOwogIH0KICByZXR1cm4gcmVzLmpzb24oKTsKfQoKZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVN0b3AoaG9vaywgZW52ID0gcHJvY2Vzcy5lbnYpIHsKICBjb25zdCBjd2QgPSBob29rLndvcmtzcGFjZVBhdGhzPy5bMF0gfHwgcHJvY2Vzcy5jd2QoKTsKICBjb25zdCBjb25maWcgPSBsb2FkQ29uZmlnKGN3ZCwgZW52KTsKICBpZiAoIWNvbmZpZykgcmV0dXJuOwoKICBjb25zdCBjb252ZXJzYXRpb25JZCA9IGhvb2suY29udmVyc2F0aW9uSWQ7CiAgaWYgKCFjb252ZXJzYXRpb25JZCkgcmV0dXJuOwoKICBjb25zdCB1c2FnZSA9IGV4dHJhY3RBbnRpZ3Jhdml0eVVzYWdlKGNvbnZlcnNhdGlvbklkLCBob29rLnRyYW5zY3JpcHRQYXRoKTsKICBpZiAoIXVzYWdlIHx8IHVzYWdlLnRva2Vuc191c2VkID09PSAwKSByZXR1cm47CgogIGNvbnN0IHN0YXRlRGlyID0gam9pbihob21lZGlyKCksICcubXVzdGVyJywgJ2FudGlncmF2aXR5LXJ1bnMnKTsKICBta2RpclN5bmMoc3RhdGVEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwogIGNvbnN0IHN0YXRlUGF0aCA9IGpvaW4oc3RhdGVEaXIsIGAke2NvbnZlcnNhdGlvbklkfS5qc29uYCk7CgogIGxldCBydW5JZCA9IG51bGw7CiAgbGV0IGxhc3RUb2tlbnMgPSAwOwogIGlmIChleGlzdHNTeW5jKHN0YXRlUGF0aCkpIHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHN0YXRlID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoc3RhdGVQYXRoLCAndXRmOCcpKTsKICAgICAgcnVuSWQgPSBzdGF0ZS5ydW5faWQ7CiAgICAgIGxhc3RUb2tlbnMgPSBzdGF0ZS50b2tlbnNfdXNlZCB8fCAwOwogICAgfSBjYXRjaCB7fQogIH0KCiAgLy8g7Yag7YGwIOuzgO2ZlOqwgCDsl4bsnLzrqbQgQVBJIO2YuOy2nCDsg53rnrUKICBpZiAocnVuSWQgJiYgdXNhZ2UudG9rZW5zX3VzZWQgPT09IGxhc3RUb2tlbnMpIHsKICAgIHJldHVybjsKICB9CgogIGlmICghcnVuSWQpIHsKICAgIGxldCBydW47CiAgICBpZiAoY29uZmlnLmlzR2xvYmFsKSB7CiAgICAgIGNvbnN0IGdpdFJlbW90ZSA9IGdldEdpdFJlbW90ZVVybChjd2QpOwogICAgICBpZiAoIWdpdFJlbW90ZSkgcmV0dXJuOyAvLyBnaXQg66CI7Y+s6rCAIOyVhOuLiOuptCDrpqztj6ztjIXtlZjsp4Ag7JWK7J2MCiAgICAgIHRyeSB7CiAgICAgICAgcnVuID0gYXdhaXQgYXBpQ2FsbChjb25maWcsICdQT1NUJywgYC9hZ2VudC1ydW5zL2J5LXJlcG9gLCB7CiAgICAgICAgICByZXBvX3VybDogZ2l0UmVtb3RlLAogICAgICAgICAgYWdlbnRfbmFtZTogJ2FudGlncmF2aXR5JywKICAgICAgICAgIHN0YXR1czogJ3N1Y2NlZWRlZCcsCiAgICAgICAgICB0b2tlbnNfdXNlZDogdXNhZ2UudG9rZW5zX3VzZWQsCiAgICAgICAgICBjb3N0OiAnMCcsCiAgICAgICAgICBzdGFydGVkX2F0OiB1c2FnZS5zdGFydGVkX2F0LAogICAgICAgICAgZW5kZWRfYXQ6IHVzYWdlLmVuZGVkX2F0LAogICAgICAgIH0pOwogICAgICB9IGNhdGNoIChlcnIpIHsKICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgW011c3Rlcl0gR2l0IOyekOuPmSDrnbzsmrDtjIUg66as7Y+s7YyFIOqxtOuEiOucgDogJHtlcnIubWVzc2FnZX1cbmApOwogICAgICAgIHJldHVybjsKICAgICAgfQogICAgfSBlbHNlIHsKICAgICAgcnVuID0gYXdhaXQgYXBpQ2FsbChjb25maWcsICdQT1NUJywgYC9hZ2VudHMvJHtjb25maWcuYWdlbnRJZH0vcnVuc2AsIHsKICAgICAgICBzdGF0dXM6ICdzdWNjZWVkZWQnLAogICAgICAgIHRva2Vuc191c2VkOiB1c2FnZS50b2tlbnNfdXNlZCwKICAgICAgICBjb3N0OiAnMCcsCiAgICAgICAgc3RhcnRlZF9hdDogdXNhZ2Uuc3RhcnRlZF9hdCwKICAgICAgICBlbmRlZF9hdDogdXNhZ2UuZW5kZWRfYXQsCiAgICAgIH0pOwogICAgfQogICAgd3JpdGVGaWxlU3luYygKICAgICAgc3RhdGVQYXRoLAogICAgICBKU09OLnN0cmluZ2lmeSh7IHJ1bl9pZDogcnVuLmlkLCB0b2tlbnNfdXNlZDogdXNhZ2UudG9rZW5zX3VzZWQsIGN3ZCB9KSwKICAgICAgJ3V0ZjgnLAogICAgKTsKICB9IGVsc2UgewogICAgYXdhaXQgYXBpQ2FsbChjb25maWcsICdQQVRDSCcsIGAvYWdlbnQtcnVucy8ke3J1bklkfWAsIHsKICAgICAgc3RhdHVzOiAnc3VjY2VlZGVkJywKICAgICAgdG9rZW5zX3VzZWQ6IHVzYWdlLnRva2Vuc191c2VkLAogICAgfSk7CiAgICB3cml0ZUZpbGVTeW5jKAogICAgICBzdGF0ZVBhdGgsCiAgICAgIEpTT04uc3RyaW5naWZ5KHsgcnVuX2lkOiBydW5JZCwgdG9rZW5zX3VzZWQ6IHVzYWdlLnRva2Vuc191c2VkLCBjd2QgfSksCiAgICAgICd1dGY4JywKICAgICk7CiAgfQp9Cgphc3luYyBmdW5jdGlvbiBtYWluKCkgewogIGxldCByYXcgPSAnJzsKICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHByb2Nlc3Muc3RkaW4pIHsKICAgIHJhdyArPSBjaHVuazsKICB9CiAgaWYgKCFyYXcudHJpbSgpKSB7CiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgne31cbicpOwogICAgcmV0dXJuOwogIH0KCiAgbGV0IGhvb2s7CiAgdHJ5IHsKICAgIGhvb2sgPSBKU09OLnBhcnNlKHJhdyk7CiAgfSBjYXRjaCB7CiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgne31cbicpOwogICAgcmV0dXJuOwogIH0KCiAgYXdhaXQgaGFuZGxlU3RvcChob29rLCBwcm9jZXNzLmVudik7CiAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ3t9XG4nKTsKfQoKaWYgKGltcG9ydC5tZXRhLnVybCA9PT0gYGZpbGU6Ly8ke3Byb2Nlc3MuYXJndlsxXX1gKSB7CiAgbWFpbigpCiAgICAuY2F0Y2goKGVycikgPT4gewogICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgW211c3Rlci1hbnRpZ3Jhdml0eS1ob29rXSAke2Vycj8uc3RhY2sgPz8gZXJyfVxuYCk7CiAgICB9KQogICAgLmZpbmFsbHkoKCkgPT4gewogICAgICBwcm9jZXNzLmV4aXQoMCk7CiAgICB9KTsKfQo=", "base64").toString("utf8");
// === EMBEDDED_HOOKS_END ===

//
// Muster Connect: 1줄 멀티 모델(Claude Code & Antigravity) 토큰 관제 연동 CLI
//
// 실행:
//   npx muster-connect
//   node scripts/muster-connect.mjs
//
// 외부 의존성(npm 패키지) 없이 Node.js 20+ 내장 모듈만으로 동작합니다 (Ponytail 원칙).

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  copyFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseProto } from './antigravity-hooks/report-agent-usage.mjs';
import { getGitRemoteUrl } from './claude-code-hooks/report-agent-usage.mjs';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const DEFAULT_MUSTER_URL = 'https://muster-xcswvn6m2q-du.a.run.app';

/** CLI 인자 파싱 (--url=..., --key=..., --project=..., --tools=..., --yes, --no-backfill, --global) */
export function parseArgs(argv) {
  const result = {
    url: null,
    key: null,
    project: null,
    tools: null, // 'claude' | 'antigravity' | 'both'
    yes: false,
    noBackfill: false,
    global: false,
    cwd: null,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--yes' || arg === '-y') result.yes = true;
    else if (arg === '--global' || arg === '-g') result.global = true;
    else if (arg === '--no-backfill') result.noBackfill = true;
    else if (arg.startsWith('--url=')) result.url = arg.slice(6);
    else if (arg.startsWith('--key=')) result.key = arg.slice(6);
    else if (arg.startsWith('--project=')) result.project = arg.slice(10);
    else if (arg.startsWith('--tools=')) result.tools = arg.slice(8);
    else if (arg.startsWith('--cwd=')) result.cwd = arg.slice(6);
  }

  return result;
}

/** ~/.muster/config.json 전역 설정 저장 (Git remote 기반 자동 라우팅용) */
export function saveGlobalMusterConfig({ apiUrl, apiKey }) {
  const musterDir = join(homedir(), '.muster');
  mkdirSync(musterDir, { recursive: true });

  const config = {
    apiUrl,
    apiKey,
  };

  writeFileSync(join(musterDir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/** 훅 스크립트를 ~/.muster/hooks로 복사하여 레포 경로에 구애받지 않도록 독립 배포 */
export function installGlobalHookScripts() {
  const hooksDir = join(homedir(), '.muster', 'hooks');
  const claudeDir = join(hooksDir, 'claude-code-hooks');
  const antigravityDir = join(hooksDir, 'antigravity-hooks');

  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(antigravityDir, { recursive: true });

  const claudeSrc = resolve(__dirname, 'claude-code-hooks', 'report-agent-usage.mjs');
  const claudeDst = join(claudeDir, 'report-agent-usage.mjs');
  if (existsSync(claudeSrc)) {
    copyFileSync(claudeSrc, claudeDst);
  } else {
    writeFileSync(claudeDst, EMBEDDED_CLAUDE_HOOK, 'utf8');
  }

  const antigravitySrc = resolve(__dirname, 'antigravity-hooks', 'report-agent-usage.mjs');
  const antigravityDst = join(antigravityDir, 'report-agent-usage.mjs');
  if (existsSync(antigravitySrc)) {
    copyFileSync(antigravitySrc, antigravityDst);
  } else {
    writeFileSync(antigravityDst, EMBEDDED_ANTIGRAVITY_HOOK, 'utf8');
  }

  const selfSrc = resolve(__dirname, 'muster-connect.mjs');
  const selfDst = join(homedir(), '.muster', 'muster-connect.mjs');
  if (existsSync(selfSrc)) {
    copyFileSync(selfSrc, selfDst);
  }

  return {
    claudeScript: existsSync(claudeDst) ? claudeDst : claudeSrc,
    antigravityScript: existsSync(antigravityDst) ? antigravityDst : antigravitySrc,
    musterConnectScript: existsSync(selfDst) ? selfDst : selfSrc,
  };
}

/** .muster/config.json 생성 및 .gitignore 갱신 */
export function saveMusterConfig(cwd, { apiUrl, apiKey, projectId, agents }) {
  const musterDir = join(cwd, '.muster');
  mkdirSync(musterDir, { recursive: true });

  const primaryAgentId = agents['claude-code'] || agents.antigravity || Object.values(agents)[0];

  const config = {
    apiUrl,
    apiKey,
    projectId,
    agents,
    agentId: primaryAgentId,
  };

  writeFileSync(join(musterDir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');

  // .gitignore에 .muster/ 추가
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    if (!content.includes('.muster/')) {
      const updated = content.endsWith('\n') ? content + '.muster/\n' : content + '\n.muster/\n';
      writeFileSync(gitignorePath, updated, 'utf8');
    }
  } else {
    writeFileSync(gitignorePath, '.muster/\n', 'utf8');
  }
}

/** Claude Code settings.json 훅 등록 */
export function registerClaudeHooks(scriptPath, settingsPath) {
  const targetPath = settingsPath || join(homedir(), '.claude', 'settings.json');
  mkdirSync(join(targetPath, '..'), { recursive: true });

  let settings = {};
  if (existsSync(targetPath)) {
    try {
      settings = JSON.parse(readFileSync(targetPath, 'utf8'));
    } catch {
      settings = {};
    }
  }

  settings.hooks = settings.hooks || {};
  const hookCmd = `node "${scriptPath}"`;

  for (const event of ['SessionStart', 'SessionEnd']) {
    settings.hooks[event] = settings.hooks[event] || [];
    let updated = false;
    for (const h of settings.hooks[event]) {
      for (const inner of h.hooks || []) {
        if (inner.command?.includes('report-agent-usage.mjs')) {
          inner.command = hookCmd;
          updated = true;
        }
      }
    }
    if (!updated) {
      settings.hooks[event].push({
        matcher: '',
        hooks: [{ type: 'command', command: hookCmd }],
      });
    }
  }

  writeFileSync(targetPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

/** Antigravity hooks.json 훅 등록 */
export function registerAntigravityHooks(scriptPath, hooksPath) {
  const targetPath = hooksPath || join(homedir(), '.gemini', 'config', 'hooks.json');
  mkdirSync(join(targetPath, '..'), { recursive: true });

  let config = {};
  if (existsSync(targetPath)) {
    try {
      config = JSON.parse(readFileSync(targetPath, 'utf8'));
    } catch {
      config = {};
    }
  }

  const hookCmd = `node "${scriptPath}"`;

  // agy-customizations 규격: hooks.json 내 "muster-reporter": { "Stop": [ { "type": "command", "command": ... } ] }
  config['muster-reporter'] = config['muster-reporter'] || {};
  config['muster-reporter'].Stop = config['muster-reporter'].Stop || [];

  let updated = false;
  for (const h of config['muster-reporter'].Stop) {
    if (h.command?.includes('report-agent-usage.mjs')) {
      h.command = hookCmd;
      updated = true;
    }
  }

  if (!updated) {
    config['muster-reporter'].Stop.push({
      type: 'command',
      command: hookCmd,
    });
  }

  writeFileSync(targetPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/** Claude Code 과거 세션 파일 스캔 */
export function scanClaudeSessions(projectName, baseDir) {
  const projectsRoot = baseDir || join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsRoot)) return [];

  const matchingDirs = readdirSync(projectsRoot).filter((name) =>
    name.toLowerCase().includes(projectName.toLowerCase()),
  );

  const sessions = [];

  for (const dirName of matchingDirs) {
    const fullDir = join(projectsRoot, dirName);
    const files = readdirSync(fullDir).filter((f) => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = join(fullDir, file);
      try {
        const content = readFileSync(filePath, 'utf8');
        let tokensUsed = 0;
        let turns = 0;
        let firstTimestamp = null;
        let lastTimestamp = null;

        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line);
          const ts = obj.timestamp ? new Date(obj.timestamp) : null;
          if (ts && !isNaN(ts.getTime())) {
            if (!firstTimestamp || ts < firstTimestamp) firstTimestamp = ts;
            if (!lastTimestamp || ts > lastTimestamp) lastTimestamp = ts;
          }

          if (obj.type === 'assistant' && obj.message?.usage) {
            const u = obj.message.usage;
            tokensUsed +=
              (u.input_tokens || 0) +
              (u.output_tokens || 0) +
              (u.cache_read_input_tokens || 0) +
              (u.cache_creation_input_tokens || 0);
            turns++;
          }
        }

        if (tokensUsed > 0) {
          const stat = statSync(filePath);
          sessions.push({
            file,
            tokensUsed,
            turns,
            startedAt: (firstTimestamp || stat.birthtime || stat.mtime).toISOString(),
            endedAt: (lastTimestamp || stat.mtime).toISOString(),
          });
        }
      } catch {}
    }
  }

  return sessions;
}

/** Antigravity 과거 세션 DB 스캔 */
export function scanAntigravitySessions(projectName, convDir, summariesDbPath) {
  const conversationsRoot = convDir || join(homedir(), '.gemini', 'antigravity', 'conversations');
  const sumDbPath =
    summariesDbPath || join(homedir(), '.gemini', 'antigravity', 'conversation_summaries.db');

  if (!existsSync(conversationsRoot) && !existsSync(sumDbPath)) return [];

  const matchedConvIds = new Set();

  // 1. conversation_summaries.db가 있으면 작업 디렉터리 필터링
  if (existsSync(sumDbPath)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const sumDb = new DatabaseSync(sumDbPath, { readOnly: true });
      const stmt = sumDb.prepare(
        'SELECT conversation_id, title, workspace_uris FROM conversation_summaries',
      );
      for (const row of stmt.all()) {
        const uris = row.workspace_uris || '';
        if (uris.toLowerCase().includes(projectName.toLowerCase())) {
          matchedConvIds.add(row.conversation_id);
        }
      }
      sumDb.close();
    } catch {}
  }

  // 2. 만약 매칭된 게 없다면 conversations 폴더의 모든 db 스캔 대상
  if (matchedConvIds.size === 0 && existsSync(conversationsRoot)) {
    for (const f of readdirSync(conversationsRoot)) {
      if (f.endsWith('.db') && !f.includes('summaries')) {
        matchedConvIds.add(f.replace('.db', ''));
      }
    }
  }

  const sessions = [];

  for (const convId of matchedConvIds) {
    const dbPath = join(conversationsRoot, `${convId}.db`);
    if (!existsSync(dbPath)) continue;

    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const stmt = db.prepare('SELECT idx, metadata FROM steps WHERE metadata IS NOT NULL');
      let totalInput = 0;
      let totalOutput = 0;
      let turns = 0;

      for (const row of stmt.all()) {
        if (!row.metadata) continue;
        const f = parseProto(Buffer.from(row.metadata));
        if (f[9]) {
          const sub = parseProto(f[9]);
          const inp = sub[2] || 0;
          const out = sub[3] || 0;
          if (inp || out) {
            totalInput += inp;
            totalOutput += out;
            turns++;
          }
        }
      }
      db.close();

      const totalTokens = totalInput + totalOutput;
      if (totalTokens > 0) {
        const stat = statSync(dbPath);
        sessions.push({
          conversationId: convId,
          tokensUsed: totalTokens,
          turns,
          startedAt: stat.birthtime?.toISOString() || stat.mtime.toISOString(),
          endedAt: stat.mtime.toISOString(),
        });
      }
    } catch {}
  }

  return sessions;
}

/** Muster REST API 통신 도우미 */
async function fetchApi(apiUrl, apiKey, path, method = 'GET', body = undefined) {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API 요청 실패 (${method} ${path}): ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function runInteractive(args) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const cwd = args.cwd ? resolve(args.cwd) : process.cwd();
  const projectName = basename(cwd);

  try {
    console.log('\n======================================================');
    console.log('🚀 Muster Connect: 1줄 멀티 모델 토큰 관제 연동');
    console.log('======================================================\n');

    // 1. 기존 설정 확인
    let existingConfig = {};
    const localConfigPath = join(cwd, '.muster', 'config.json');
    if (existsSync(localConfigPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(localConfigPath, 'utf8'));
      } catch {}
    }

    // 2. Muster URL 입력
    let apiUrl =
      args.url ||
      existingConfig.apiUrl ||
      (await rl.question(`Muster 서비스 URL [${DEFAULT_MUSTER_URL}]: `));
    apiUrl = (apiUrl.trim() || DEFAULT_MUSTER_URL).replace(/\/$/, '');
    if (!apiUrl.endsWith('/api/v1')) {
      apiUrl = `${apiUrl}/api/v1`;
    }

    // 3. API Key 입력
    let apiKey = args.key || existingConfig.apiKey;
    if (!apiKey) {
      apiKey = await rl.question('Muster 프로젝트 API Key: ');
      apiKey = apiKey.trim();
    }
    if (!apiKey) {
      console.error('❌ API Key가 필요합니다. Muster 프로젝트 화면에서 발급받아 입력해주세요.');
      process.exit(1);
    }

    // 4. API Key 검증
    console.log(`\n🔍 API Key 검증 중 (${apiUrl})...`);
    let verifiedProjectId = null;
    try {
      const res = await fetchApi(apiUrl, apiKey, '/api-keys/verify');
      verifiedProjectId = res.project_id;
    } catch {
      // 구버전 서버 호환성: /api-keys/verify가 없는 경우 by-repo 핑으로 검증
      try {
        await fetchApi(apiUrl, apiKey, '/agent-runs/by-repo', 'POST', {
          git_remote_url: 'https://github.com/ping/check',
          agent_name: 'ping',
          tokens_used: 0,
        });
      } catch (pingErr) {
        if (pingErr.message.includes('401')) {
          console.error(`❌ API Key 검증 실패: 유효하지 않거나 만료된 API 키입니다.`);
          process.exit(1);
        }
      }
    }

    const projectId = existingConfig.projectId || args.project || verifiedProjectId;
    if (projectId) {
      console.log(`✓ 인증 성공! 프로젝트 연결됨 (Project ID: ${projectId})`);
    } else {
      console.log(`✓ 인증 성공! API 키 확인 완료`);
    }

    // 4.1 전역 설정 모드 (--global)
    if (args.global) {
      saveGlobalMusterConfig({ apiUrl, apiKey });
      console.log(`✓ ~/.muster/config.json 전역 설정 저장 완료`);

      const { claudeScript, antigravityScript } = installGlobalHookScripts();
      registerClaudeHooks(claudeScript);
      console.log(`✓ Claude Code 전역 훅 등록 완료 (~/.claude/settings.json)`);

      registerAntigravityHooks(antigravityScript);
      console.log(`✓ Antigravity 전역 훅 등록 완료 (~/.gemini/config/hooks.json)`);

      console.log(`\n🎉 전역 1회 자동 라우팅 연동이 완료되었습니다!`);
      console.log(`   앞으로 어떤 Git 레포지토리에서든 Claude Code 또는 Antigravity로 작업하시면`);
      console.log(
        `   Git remote 주소를 통해 해당 Muster 프로젝트 대시보드로 토큰이 자동 집계됩니다.`,
      );
      console.log(`   (개별 레포 폴더마다 muster-connect를 실행할 필요가 없습니다)\n`);
      rl.close();
      return;
    }

    // 5. 연동 대상 도구 선택
    console.log('\n연동할 AI 코딩 에이전트를 선택하세요:');
    console.log('  [1] Claude Code (Anthropic)');
    console.log('  [2] Antigravity (Google)');
    console.log('  [3] 둘 다 연동 (기본값)');
    let toolChoice = args.tools || (await rl.question('선택 [3]: '));
    toolChoice = toolChoice.trim() || '3';

    const enableClaude =
      toolChoice === '1' ||
      toolChoice === '3' ||
      toolChoice.toLowerCase() === 'both' ||
      toolChoice.toLowerCase() === 'claude';
    const enableAntigravity =
      toolChoice === '2' ||
      toolChoice === '3' ||
      toolChoice.toLowerCase() === 'both' ||
      toolChoice.toLowerCase() === 'antigravity';

    const agentsMap = { ...(existingConfig.agents || {}) };
    const gitRemote = getGitRemoteUrl(cwd);

    // 6. 에이전트 등록 확인/생성
    if (gitRemote) {
      if (enableClaude && !agentsMap['claude-code']) {
        try {
          const res = await fetchApi(apiUrl, apiKey, '/agent-runs/by-repo', 'POST', {
            repo_url: gitRemote,
            agent_name: 'claude-code',
            tokens_used: 0,
            status: 'succeeded',
          });
          if (res.agent_id) {
            agentsMap['claude-code'] = res.agent_id;
            console.log(`✓ Claude Code 에이전트 연결 완료 (${res.agent_id})`);
          }
        } catch {}
      }

      if (enableAntigravity && !agentsMap.antigravity) {
        try {
          const res = await fetchApi(apiUrl, apiKey, '/agent-runs/by-repo', 'POST', {
            repo_url: gitRemote,
            agent_name: 'antigravity',
            tokens_used: 0,
            status: 'succeeded',
          });
          if (res.agent_id) {
            agentsMap.antigravity = res.agent_id;
            console.log(`✓ Antigravity 에이전트 연결 완료 (${res.agent_id})`);
          }
        } catch {}
      }
    }

    let agentsList = [];
    try {
      const agentsRes = await fetchApi(apiUrl, apiKey, `/projects/${projectId}/agents`);
      agentsList = agentsRes.items || (Array.isArray(agentsRes) ? agentsRes : []);
    } catch {
      agentsList = [];
    }

    if (enableClaude && !agentsMap['claude-code']) {
      const existing = agentsList.find((a) => a.name === 'claude-code');
      if (existing) {
        agentsMap['claude-code'] = existing.id;
      } else {
        try {
          const created = await fetchApi(apiUrl, apiKey, `/projects/${projectId}/agents`, 'POST', {
            name: 'claude-code',
            config_md: '# Claude Code CLI Agent',
          });
          agentsMap['claude-code'] = created.id;
          console.log(`✓ Claude Code 에이전트 생성 완료 (${created.id})`);
        } catch {
          agentsMap['claude-code'] = projectId;
        }
      }
    }

    if (enableAntigravity && !agentsMap.antigravity) {
      const existing = agentsList.find((a) => a.name === 'antigravity');
      if (existing) {
        agentsMap.antigravity = existing.id;
      } else {
        try {
          const created = await fetchApi(apiUrl, apiKey, `/projects/${projectId}/agents`, 'POST', {
            name: 'antigravity',
            config_md: '# Google Antigravity Agent',
          });
          agentsMap.antigravity = created.id;
          console.log(`✓ Antigravity 에이전트 생성 완료 (${created.id})`);
        } catch {
          agentsMap.antigravity = projectId;
        }
      }
    }

    // 7. .muster/config.json 저장
    saveMusterConfig(cwd, {
      apiUrl,
      apiKey,
      projectId,
      agents: agentsMap,
    });
    console.log(`✓ .muster/config.json 설정 파일 저장 완료 (.gitignore 등록됨)`);

    // 8. 훅 등록
    const { claudeScript, antigravityScript } = installGlobalHookScripts();
    if (enableClaude) {
      registerClaudeHooks(claudeScript);
      console.log(`✓ Claude Code 전역 훅 등록 완료 (~/.claude/settings.json)`);
    }

    if (enableAntigravity) {
      registerAntigravityHooks(antigravityScript);
      // 프로젝트 로컬 .agents/hooks.json에도 등록
      registerAntigravityHooks(antigravityScript, join(cwd, '.agents', 'hooks.json'));
      console.log(`✓ Antigravity 훅 등록 완료 (~/.gemini/config/hooks.json & .agents/hooks.json)`);
    }

    // 9. 과거 세션 백필(Backfill)
    let doBackfill = args.yes || !args.noBackfill;
    if (!args.yes && !args.noBackfill) {
      const ans = await rl.question('\n과거 세션 이력을 Muster에 지금 백필하시겠습니까? (Y/n): ');
      doBackfill = ans.trim().toLowerCase() !== 'n';
    }

    if (doBackfill) {
      console.log('\n📦 과거 세션 로그 스캔 및 백필 시작...');

      if (enableClaude && agentsMap['claude-code']) {
        const claudeSessions = scanClaudeSessions(projectName);
        console.log(`- Claude Code 발견된 세션: ${claudeSessions.length}건`);
        let count = 0;
        let tokens = 0;
        for (const s of claudeSessions) {
          try {
            await fetchApi(apiUrl, apiKey, `/agents/${agentsMap['claude-code']}/runs`, 'POST', {
              status: 'succeeded',
              tokens_used: s.tokensUsed,
              cost: '0',
              started_at: s.startedAt,
              ended_at: s.endedAt,
            });
            count++;
            tokens += s.tokensUsed;
          } catch {}
        }
        console.log(
          `  ✓ Claude Code 백필 완료: ${count}개 세션 (${(tokens / 1_000_000).toFixed(2)}M 토큰)`,
        );
      }

      if (enableAntigravity && agentsMap.antigravity) {
        const agySessions = scanAntigravitySessions(projectName);
        console.log(`- Antigravity 발견된 세션: ${agySessions.length}건`);
        let count = 0;
        let tokens = 0;
        for (const s of agySessions) {
          try {
            await fetchApi(apiUrl, apiKey, `/agents/${agentsMap.antigravity}/runs`, 'POST', {
              status: 'succeeded',
              tokens_used: s.tokensUsed,
              cost: '0',
              started_at: s.startedAt,
              ended_at: s.endedAt,
            });
            count++;
            tokens += s.tokensUsed;
          } catch {}
        }
        console.log(
          `  ✓ Antigravity 백필 완료: ${count}개 세션 (${(tokens / 1_000_000).toFixed(2)}M 토큰)`,
        );
      }
    }

    console.log('\n🎉 모든 연동 설정이 성공적으로 완료되었습니다!');
    console.log(
      `이제 Claude Code 및 Antigravity 사용 시 토큰이 Muster 대시보드에 자동 집계됩니다.`,
    );
    console.log(`대시보드 확인: ${apiUrl.replace('/api/v1', '')}/projects/${projectId}\n`);
  } finally {
    rl.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Muster Connect CLI

사용법:
  npx muster-connect [옵션]
  node scripts/muster-connect.mjs [옵션]

옵션:
  --url=<url>        Muster 서비스 API URL (기본값: ${DEFAULT_MUSTER_URL})
  --key=<api_key>    Muster 프로젝트 API Key
  --project=<id>     Muster Project ID
  --tools=<tools>    연동 도구 (claude | antigravity | both)
  --yes, -y          모든 확인 질문에 기본값으로 자동 응답
  --no-backfill      과거 세션 백필 건너뛰기
  --help, -h         도움말 출력
`);
    process.exit(0);
  }

  runInteractive(args).catch((err) => {
    console.error('\n❌ 연동 중 오류 발생:', err);
    process.exit(1);
  });
}
