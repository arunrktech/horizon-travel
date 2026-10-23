import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/auth/RequireAuth";
import Home from "@/pages/Home";
import FlightResults from "@/pages/FlightResults";
import HotelResults from "@/pages/HotelResults";
import ActivityResults from "@/pages/ActivityResults";
import Trip from "@/pages/Trip";
import Checkout from "@/pages/Checkout";
import MockPay from "@/pages/MockPay";
import { MyTrips, TripDetail } from "@/pages/Trips";
import { NotFound, Profile, SignIn } from "@/pages/Account";
import { Dashboard, StaffBookingDetail, StaffBookings, StaffCustomerDetail, StaffCustomers, StaffLayout } from "@/pages/staff/Staff";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search/flights" element={<FlightResults />} />
        <Route path="search/hotels" element={<HotelResults />} />
        <Route path="search/activities" element={<ActivityResults />} />
        <Route path="trip" element={<Trip />} />
        <Route path="sign-in" element={<SignIn />} />
        <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="pay/mock" element={<RequireAuth><MockPay /></RequireAuth>} />
        <Route path="trips" element={<RequireAuth><MyTrips /></RequireAuth>} />
        <Route path="trips/:id" element={<RequireAuth><TripDetail /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="staff" element={<RequireAuth role="staff"><StaffLayout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="bookings" element={<StaffBookings />} />
          <Route path="bookings/:id" element={<StaffBookingDetail />} />
          <Route path="customers" element={<StaffCustomers />} />
          <Route path="customers/:id" element={<StaffCustomerDetail />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
