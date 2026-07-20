import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Register } from './pages/Register'
import { GoogleCallback } from './pages/GoogleCallback'
import { MyPage } from './pages/MyPage'
import { Training } from './pages/Training'
import { Anaheim } from './pages/Anaheim'
import { Tactics } from './pages/Tactics'
import { Hangar } from './pages/Hangar'
import { Base } from './pages/Base'
import { Ranking } from './pages/Ranking'
import { Profile } from './pages/Profile'
import { ProfileEdit } from './pages/ProfileEdit'
import { Account } from './pages/Account'
import { Admin } from './pages/Admin'
import { Log } from './pages/Log'
import { Team } from './pages/Team'
import { DebugBattle } from './pages/DebugBattle'
import { Database } from './pages/Database'
import { Tournament } from './pages/Tournament'
import { TournamentView } from './pages/TournamentView'
import { Faction } from './pages/Faction'
import { FactionDetail } from './pages/FactionDetail'
import { FactionUnit } from './pages/FactionUnit'
import { Chat } from './pages/Chat'
import { BBS } from './pages/BBS'
import { Simulator } from './pages/Simulator'
import Trade from './pages/Trade'
import Battle from './pages/Battle'
import { Museum } from './pages/Museum'
import { Replay } from './pages/Replay'
import { AppLayout } from './components/AppLayout'
import { ToastHost } from './components/ToastHost'
import { ConfirmHost } from './components/ConfirmHost'
import { PromptHost } from './components/PromptHost'

function App() {
  return (
    <>
    {/* alert/confirm/prompt の置換。どのページからでも showToast/showConfirm/showPrompt で呼べる */}
    <ToastHost />
    <ConfirmHost />
    <PromptHost />
    <Routes>
      {/* ログイン前。ヘッダー・ナビを出さないので AppLayout の外に置く */}
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      {/* Google 認証の着地点。ログイン中/前のどちらからも来るので外に置く */}
      <Route path="/auth/google" element={<GoogleCallback />} />

      {/* ログイン後。認証ガードとヘッダー/ナビは AppLayout が持つ */}
      <Route element={<AppLayout />}>
        <Route path="/mypage" element={<MyPage />} />
        <Route path="/training" element={<Training />} />
        <Route path="/anaheim" element={<Anaheim />} />
        <Route path="/hangar" element={<Hangar />} />
        <Route path="/base" element={<Base />} />
        <Route path="/battle" element={<Battle />} />
        <Route path="/tactics" element={<Tactics />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/profile/:id" element={<Profile />} />
        <Route path="/profile-edit" element={<ProfileEdit />} />
        {/* アカウント設定（ログイン方法・キャラ削除）。ゲーム側の設定は /profile-edit */}
        <Route path="/account" element={<Account />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/log" element={<Log />} />
        <Route path="/team" element={<Team />} />
        <Route path="/debug-battle" element={<DebugBattle />} />
        <Route path="/database" element={<Database />} />
        <Route path="/tournament" element={<Tournament />} />
        <Route path="/tournament/:id" element={<TournamentView />} />
        <Route path="/faction" element={<Faction />} />
        <Route path="/faction/:id" element={<FactionDetail />} />
        <Route path="/faction-unit" element={<FactionUnit />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/bbs" element={<BBS />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/trade" element={<Trade />} />
        <Route path="/museum" element={<Museum />} />
        <Route path="/museum/:userId" element={<Museum />} />
        <Route path="/replay/:id" element={<Replay />} />
      </Route>
    </Routes>
    </>
  )
}

export default App
