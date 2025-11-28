
from ryanair import Ryanair
from datetime import datetime, timedelta

def main():
    print("Testing Ryanair API with Python...")
    try:
        api = Ryanair("EUR")
        tomorrow = datetime.now() + timedelta(days=14)
        date_str = tomorrow.strftime("%Y-%m-%d")
        print(f"Checking flights for {date_str}...")
        
        flights = api.get_cheapest_flights("DUB", date_str, date_str, destination_airport="STN")
        print(f"Found {len(flights)} flights.")
        if flights:
            print(f"First flight price: {flights[0].price} {flights[0].currency}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
