import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Register } from './pages/Register'
import { MyPage } from './pages/MyPage'
import { Training } from './pages/Training'
import { Anaheim } from './pages/Anaheim'
import { Tactics } from './pages/Tactics'
import { Hangar } from './pages/Hangar'
import { Ranking } from './pages/Ranking'
import { Profile } from './pages/Profile'
import { ProfileEdit } from './pages/ProfileEdit'
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
import { ToastHost } from './components/ToastHost'
import { ConfirmHost } from './components/ConfirmHost'
import './App.css'

function App() {
  return (
    <>
    <ToastHost />
    <ConfirmHost />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/training" element={<Training />} />
      <Route path="/anaheim" element={<Anaheim />} />
      <Route path="/hangar" element={<Hangar />} />
      <Route path="/battle" element={<Battle />} />
      <Route path="/tactics" element={<Tactics />} />
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/profile/:id" element={<Profile />} />
      <Route path="/profile-edit" element={<ProfileEdit />} />
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
    </Routes>
    </>
  )
}

export default App
