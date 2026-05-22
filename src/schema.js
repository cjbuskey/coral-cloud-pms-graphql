export const typeDefs = /* GraphQL */ `
  """
  A guest of Coral Cloud Resorts. The guestId matches the guest_id used in the
  Snowflake-resident room service request system, enabling federation joins
  inside Data 360.
  """
  type Guest {
    guestId: ID!
    firstName: String!
    lastName: String!
    email: String!
    phone: String
    loyaltyTier: LoyaltyTier!
    lifetimeStays: Int!
    lifetimeSpend: Float!
    preferences: String
    vipFlag: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  enum LoyaltyTier {
    STANDARD
    GOLD
    PLATINUM
    DIAMOND
  }

  """
  A reservation. The reservationId matches the reservation_id in Snowflake
  RSR rows, and roomNumber matches the room_number assigned to the request.
  """
  type Reservation {
    reservationId: ID!
    guestId: ID!
    roomNumber: String!
    roomType: String!
    checkIn: String!
    checkOut: String!
    nights: Int!
    nightlyRate: Float!
    totalValue: Float!
    status: ReservationStatus!
    bookingChannel: String!
    specialRequests: String
    createdAt: String!
    updatedAt: String!
  }

  enum ReservationStatus {
    CONFIRMED
    IN_HOUSE
    CHECKED_OUT
    CANCELLED
  }

  """
  A physical room in the resort. roomNumber is the natural primary key and
  matches the room_number used in Snowflake RSR rows.
  """
  type Room {
    roomNumber: ID!
    roomType: String!
    floor: Int!
    building: String!
    maxOccupancy: Int!
    nightlyRate: Float!
    oceanView: Boolean!
    accessible: Boolean!
  }

  type Query {
    guests: [Guest!]!
    guest(guestId: ID!): Guest
    reservations: [Reservation!]!
    reservation(reservationId: ID!): Reservation
    rooms: [Room!]!
    room(roomNumber: ID!): Room
  }
`;
