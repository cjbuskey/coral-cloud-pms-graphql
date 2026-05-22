import { guests, reservations, rooms } from "./seed.js";

export const resolvers = {
  Query: {
    guests: () => guests,
    guest: (_, { guestId }) => guests.find((g) => g.guestId === guestId) ?? null,
    reservations: () => reservations,
    reservation: (_, { reservationId }) =>
      reservations.find((r) => r.reservationId === reservationId) ?? null,
    rooms: () => rooms,
    room: (_, { roomNumber }) => rooms.find((r) => r.roomNumber === roomNumber) ?? null,
  },
};
